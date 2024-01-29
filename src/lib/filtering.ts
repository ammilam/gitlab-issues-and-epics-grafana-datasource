
import {  MutableDataFrame } from '@grafana/data';

export function applyTypeFilter(
  typeFilter: string,
  dataFrames: MutableDataFrame[]
): MutableDataFrame[] {
  return dataFrames.map((dataFrame) => {
    const filteredRows = dataFrame.toArray().filter((row) => {
      const typeValue = row['type'];
      // Update the filtering condition
      return typeFilter && typeValue && typeValue.toString().toLowerCase() === typeFilter.toLowerCase();
    });

    const resultDataFrame = new MutableDataFrame({
      refId: dataFrame.refId,
      fields: dataFrame.fields,
    });

    filteredRows.forEach((row) => resultDataFrame.add(row));
    return resultDataFrame;
  });
}

export function applyDateFilter(
  createdAfter: Date | null,
  createdBefore: Date | null,
  updatedAfter: Date | null,
  updatedBefore: Date | null,
  closedAfter: Date | null,
  closedBefore: Date | null,
  dataFrames: MutableDataFrame[]
): MutableDataFrame[] {
  return dataFrames.map((dataFrame) => {
    const filteredRows = dataFrame.toArray().filter((row) => {
      let created = new Date(row['created_at']);
      let updated = new Date(row['updated_at']);
      let closed = new Date(row['closed_at']);
      let createdFrom = createdAfter ? new Date(createdAfter) : '';
      let createdTo = createdBefore ? new Date(createdBefore) : '';
      let updatedFrom = updatedAfter ? new Date(updatedAfter) : '';
      let updatedTo = updatedBefore ? new Date(updatedBefore) : '';
      let closedFrom = closedAfter ? new Date(closedAfter) : '';
      let closedTo = closedBefore ? new Date(closedBefore) : '';

      const createdFilter =
        (!createdAfter || created >= createdFrom) &&
        (!createdBefore || created <= createdTo);

      const updatedFilter =
        (!updatedAfter || updated >= updatedFrom) &&
        (!updatedBefore || updated <= updatedTo);

      const closedFilter =
        (!closedAfter || closed >= closedFrom) &&
        (!closedBefore || closed <= closedTo);

      return createdFilter && updatedFilter && closedFilter;
    });

    const resultDataFrame = new MutableDataFrame({
      refId: dataFrame.refId,
      fields: dataFrame.fields,
    });

    filteredRows.forEach((row) => resultDataFrame.add(row));
    return resultDataFrame;
  });
}
