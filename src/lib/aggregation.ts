import { FieldType, MutableDataFrame } from '@grafana/data';

export function applyGroupByAndAggregate(
  groupBy: string[],
  aggregateFunction: string,
  createdAfter: Date | null,
  createdBefore: Date | null,
  updatedAfter: Date | null,
  updatedBefore: Date | null,
  closedAfter: Date | null,
  closedBefore: Date | null,
  dataFrames: MutableDataFrame[],
  filters: Array<{ field: string; value: string | string[]; }>,
  typeFilter?: string,
  regexFilters?: Array<{ field: string; value: string | string[]; }>
): MutableDataFrame[] {
  const transformedDataFrames = dataFrames.map((dataFrame) => {
    const groupedData: Record<string, any[]> = {};
    for (let row of dataFrame) {
      const created = new Date(row['created_at']);
      const updated = new Date(row['updated_at']);
      const closed = new Date(row['closed_at']);
      const createdFrom = createdAfter ? new Date(createdAfter) : null;
      const createdTo = createdBefore ? new Date(createdBefore) : null;
      const updatedFrom = updatedAfter ? new Date(updatedAfter) : null;
      const updatedTo = updatedBefore ? new Date(updatedBefore) : null;
      const closedFrom = closedAfter ? new Date(closedAfter) : null;
      const closedTo = closedBefore ? new Date(closedBefore) : null;
      const isRowMatchingFilters = filters.every((filter) => {
        let { field, value } = filter;
        const rowValue = row[field] === null ? 'null' : row[field];

        if (value === 'null') {
          return rowValue === null;
        }
        //check if string is a comma separated list
        if (typeof value === 'string' && value.includes(',')) {
          // if it is, turn it into an array

          const v = value.split(',').map((v) => v.trim());
          // and check if rowValue is included in it
          return v.includes(rowValue);
        } else {
          return rowValue === value
        }
      });

      const isRowMatchingRebgexFilters = (row: any) => {
        return regexFilters?.every((filter) => {
          let { field, value } = filter;
          let regex = new RegExp(value as string);
          const rowValue = row[field] === null ? 'null' : row[field];

          if (value === 'null') {
            return rowValue === null;
          }
          return regex.test(rowValue)
        });
      }

      const createdFilter =
        (!createdAfter || !createdFrom || created >= createdFrom) &&
        (!createdBefore || !createdTo || created <= createdTo);

      const updatedFilter =
        (!updatedAfter || !updatedFrom || updated >= updatedFrom) &&
        (!updatedBefore || !updatedTo || updated <= updatedTo);

      const closedFilter =
        (!closedAfter || !closedFrom || closed >= closedFrom) &&
        (!closedBefore || !closedTo || closed <= closedTo);

      if (
        (!typeFilter || row['type'] === typeFilter) &&
        createdFilter &&
        updatedFilter &&
        closedFilter &&
        isRowMatchingFilters &&
        isRowMatchingRebgexFilters(row)
      ) {
        const groupValues = groupBy.map((field) => row[field] ?? 'N/A').join('|'); //
        if (!groupedData[groupValues]) {
          groupedData[groupValues] = [];
        }

        // Check if the row has already been counted for this group
        const isRowCounted = groupedData[groupValues].some(
          (r) => r.id === row.id && r.type === row.type
        );

        if (!isRowCounted) {
          // If the row has not been counted, add it to the group
          groupedData[groupValues].push(row);
        }
      }
    }

    const groupByFields = groupBy.map((field) => {
      const fieldType = dataFrame.fields.find((f) => f.name === field)?.type || FieldType.string;
      return { name: field, type: fieldType };
    });

    const resultDataFrame = new MutableDataFrame({
      refId: dataFrame.refId,
      fields: [
        ...groupByFields,
        { name: 'Value', type: FieldType.number },
      ],
    });

    for (const group in groupedData) {
      const groupRows = groupedData[group];
      let value: number;
      switch (aggregateFunction) {
        case 'count':
          // Count the number of unique rows in the group
          value = new Set(groupRows.map((r) => `${r.id}|${r.type}`)).size;
          break;
        case 'sum':
          value = groupRows.reduce((sum, row) => sum + row['Value'], 0);
          break;
        default:
          throw new Error(`Unsupported aggregate function: ${aggregateFunction}`);
      }
      const groupValues = group.split('|');
      const rowToAdd = groupBy.reduce((obj, field, idx) => {
        obj[field] = groupValues[idx];
        return obj;
      }, {} as Record<string, any>);
      rowToAdd['Value'] = value;
      resultDataFrame.add(rowToAdd);
    }
    return resultDataFrame;
  });
  return transformedDataFrames;
}
