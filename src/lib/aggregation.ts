import { FieldType, MutableDataFrame } from '@grafana/data';

// applyGroupByAndAggregate is a function that takes a list of dataframes and applies a group by and aggregate function to them
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
  
  // Apply the group by and aggregate function to each dataframe
  const transformedDataFrames = dataFrames.map((dataFrame) => {

    // Create a map of group values to rows
    const groupedData: Record<string, any[]> = {};

    // Iterate over each row in the dataframe
    for (let row of dataFrame) {

      // Convert the created, updated, and closed dates to Date objects
      const created = new Date(row['created_at']);
      const updated = new Date(row['updated_at']);
      const closed = new Date(row['closed_at']);

      // Convert the filter dates to Date objects
      const createdFrom = createdAfter ? new Date(createdAfter) : null;
      const createdTo = createdBefore ? new Date(createdBefore) : null;
      const updatedFrom = updatedAfter ? new Date(updatedAfter) : null;
      const updatedTo = updatedBefore ? new Date(updatedBefore) : null;
      const closedFrom = closedAfter ? new Date(closedAfter) : null;
      const closedTo = closedBefore ? new Date(closedBefore) : null;

      // Check if the row matches the filters
      const isRowMatchingFilters = filters.every((filter) => {

        let { field, value } = filter;

        // Check if the row value is null
        const rowValue = row[field] === null ? 'null' : row[field];

        // Check if the filter value is null
        if (value === 'null') {
          return rowValue === null;
        }

        //check if string is a comma separated list
        if (typeof value === 'string' && value.includes(',')) {
          // if it is, turn it into an array

          const v = value.split(',').map((v) => v.trim());
          // and check if rowValue is included in it
          return v.includes(rowValue); // if it is, return true
        } else {
          return rowValue === value // if it's not, return false
        }
      });

      // Check if the row matches the regex filters
      const isRowMatchingRebgexFilters = (row: any) => {

        // for each regex filter
        return regexFilters?.every((filter) => {

          // get the field and value
          let { field, value } = filter;

          // create a regex from the value
          let regex = new RegExp(value as string);

          // Check if the row value is null
          const rowValue = row[field] === null ? 'null' : row[field];

          // Check if the filter value is null
          if (value === 'null') {
            return rowValue === null; // if it is, return true
          }
          return regex.test(rowValue) // if it's not, return false
        });
        
      }

      // Check if the row matches the date filters
      const createdFilter =
        (!createdAfter || !createdFrom || created >= createdFrom) &&
        (!createdBefore || !createdTo || created <= createdTo);

      const updatedFilter =
        (!updatedAfter || !updatedFrom || updated >= updatedFrom) &&
        (!updatedBefore || !updatedTo || updated <= updatedTo);

      const closedFilter =
        (!closedAfter || !closedFrom || closed >= closedFrom) &&
        (!closedBefore || !closedTo || closed <= closedTo);

      // Check if the row matches the type filter continued..
      if (
        (!typeFilter || row['type'] === typeFilter) &&
        createdFilter &&
        updatedFilter &&
        closedFilter &&
        isRowMatchingFilters &&
        isRowMatchingRebgexFilters(row) // add the regex filter check
      ) {
        // If the row matches the filters, add it to the group
        const groupValues = groupBy.map((field) => row[field] ?? 'N/A').join('|');

        // Check if the group has been created
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

    // Create a field for each groupBy field
    const groupByFields = groupBy.map((field) => {
      const fieldType = dataFrame.fields.find((f) => f.name === field)?.type || FieldType.string;
      return { name: field, type: fieldType };
    });

    // Create a field for the aggregate function
    const resultDataFrame = new MutableDataFrame({
      refId: dataFrame.refId,
      fields: [
        ...groupByFields,
        { name: 'Value', type: FieldType.number },
      ],
    });

    // Calculate the aggregate function for each group
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

      // Add a row to the result dataframe
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
