import React, { useState, useEffect } from 'react';
import { SelectableValue, QueryEditorProps, toUtc } from '@grafana/data';
import { Select, MultiSelect, InlineField, InlineFieldRow, DateTimePicker, Button, AsyncSelect } from '@grafana/ui';
import { DataSource } from '../datasource';
import { MyDataSourceOptions, MyQuery, Filter } from '../types';

type Props = QueryEditorProps<DataSource, MyQuery, MyDataSourceOptions>;

export const QueryEditor: React.FC<Props> = (props) => {

  const loadFilterValueOptions = async (field: string) => {
    if (!field) {
      return [];
    }

    // Fetch the data once
    const { issues, epics } = await props.datasource.getIssuesAndEpics(props.datasource.groupId);
    const allData = [...issues, ...epics];

    // Pass the data to the getUniqueFieldValues method
    const uniqueValues = await props.datasource.getUniqueFieldValues(field, allData);
    let obj = uniqueValues.map((value) => ({ label: value, value }));
    return obj;
  };

  const { onChange, query } = props;
  // Set a default value for the typeFilter property
  query.typeFilter = query.typeFilter || 'issue';
  query.aggregateFunction = query.aggregateFunction || 'count';
  if (!query.groupBy) {
    // Access the groupBy property
    query.groupBy = [];
  }
  const [fields, setFields] = useState<string[]>([]);
  const [aggregateFunctions] = useState<string[]>(['count']);
  const [typeOptions] = useState<string[]>(['issue', 'epic']);
  query.createdAfter = query.createdAfter || null;
  query.createdBefore = query.createdBefore || null;
  useEffect(() => {
    // Get the fields from the data source
    const dataSourceFields = props.datasource.issueAndEpicFields;
    setFields(dataSourceFields);
  }, [props.datasource]);

  // Set a default value for the filters property
  query.filters = query.filters || [];

  // Initialize the filters state
  const [filters, setFilters] = useState<Filter[]>(query.filters);
  // Add event handlers for filters
  const addFilter = () => {
    setFilters([...filters, { field: '', value: '' }]);
  };

  const updateFilter = (index: number, updatedFilter: Filter) => {
    const newFilters = filters.map((filter, i) => (i === index ? updatedFilter : filter));
    setFilters(newFilters);
    onChange({ ...query, filters: newFilters });
  };

  const removeFilter = (index: number) => {
    const newFilters = filters.filter((_, i) => i !== index);
    setFilters(newFilters);
    onChange({ ...query, filters: newFilters });
  };

  const onGroupByChange = (selected: Array<SelectableValue<string>>) => {
    onChange({ ...query, groupBy: selected.map((item) => item.value || '') });
  };

  const onAggregateFunctionChange = (selected: SelectableValue<string>) => {
    onChange({ ...query, aggregateFunction: selected.value });
  };

  const onTypeFilterChange = (selected: SelectableValue<string>) => {
    onChange({ ...query, typeFilter: selected.value || '' });
  };

  const onDateFieldChange = (field: string | '', date: Date | null) => {
    switch (field) {
      case 'createdAfter':
        onChange({ ...query, createdAfter: date || null });
        break;
      case 'createdBefore':
        onChange({ ...query, createdBefore: date || null });
        break;
      case 'dueDateFrom':
        onChange({ ...query, dueDateAfter: date || null });
        break;
      case 'dueDateTo':
        onChange({ ...query, dueDateBefore: date || null });
        break;
      case 'updatedAfter':
        onChange({ ...query, updatedAfter: date || null });
        break;
      case 'updatedBefore':
        onChange({ ...query, updatedBefore: date || null });
        break;
      case 'closedAfter':
        onChange({ ...query, closedAfter: date || null });
        break;
      case 'closedBefore':
        onChange({ ...query, closedBefore: date || null });
        break;
    }
  };

  return (
    <div>
      <InlineFieldRow>
        <InlineField label="Group By" grow>
          <MultiSelect
            options={fields.map((field) => ({ label: field, value: field }))}
            value={query.groupBy.map((field) => ({ label: field, value: field }))}
            onChange={onGroupByChange}
            placeholder="Select fields for grouping"
            width={30}
          />
        </InlineField>
        <InlineField label="Aggregate Function" grow>
          <Select
            options={aggregateFunctions.map((func) => ({ label: func, value: func }))}
            value={query.aggregateFunction}
            onChange={onAggregateFunctionChange}
            placeholder="Select an aggregate function"
            width={30}
          />
        </InlineField>
        <InlineField label="Type" grow>
          <Select
            options={typeOptions.map((type) => ({ label: type, value: type }))}
            value={query.typeFilter}
            onChange={onTypeFilterChange}
            placeholder="Select a type"
            width={30}
          />
        </InlineField>
      </InlineFieldRow>
        <InlineFieldRow>
        <InlineField label="Created After">
          <DateTimePicker
            label="Date"
            date={query.createdAfter ? toUtc(query.createdAfter) : undefined}
            onChange={(value) => onDateFieldChange("createdAfter" || '', new Date(value.toDate()))}
          />
        </InlineField>
        <InlineField label="Created Before">
          <DateTimePicker
            label="Date"
            date={query.createdBefore ? toUtc(query.createdBefore) : undefined}
            onChange={(value) => onDateFieldChange("createdBefore" || '', new Date(value.toDate()))}
          />
        </InlineField>
      </InlineFieldRow>
      <InlineFieldRow>
        <InlineField label="Updated After">
          <DateTimePicker
            label="Date"
            date={query.updatedAfter ? toUtc(query.updatedAfter) : undefined}
            onChange={(value) => onDateFieldChange("updatedAfter" || '', new Date(value.toDate()))}
          />
        </InlineField>
        <InlineField label="Updated Before">
          <DateTimePicker
            label="Date"
            date={query.updatedBefore ? toUtc(query.updatedBefore) : undefined}
            onChange={(value) => onDateFieldChange("updatedBefore" || '', new Date(value.toDate()))}
          />
        </InlineField>
      </InlineFieldRow>
      <InlineFieldRow>
        <InlineField label="Closed After">
          <DateTimePicker
            label="Date"
            date={query.closedAfter ? toUtc(query.closedAfter) : undefined}
            onChange={(value) => onDateFieldChange("closedAfter" || '', new Date(value.toDate()))}
          />
        </InlineField>
        <InlineField label="Closed Before Before">
          <DateTimePicker
            label="Date"
            date={query.closedBefore ? toUtc(query.closedBefore) : undefined}
            onChange={(value) => onDateFieldChange("closedBefore" || '', new Date(value.toDate()))}
          />
        </InlineField>
      </InlineFieldRow>
      <InlineFieldRow>
        <InlineField label="Due Date After">
          <DateTimePicker
            label="Date"
            date={query.dueDateAfter ? toUtc(query.dueDateAfter) : undefined}
            onChange={(value) => onDateFieldChange("dueDateAfter" || '', new Date(value.toDate()))}
          />
        </InlineField>
        <InlineField label="Due Date Before">
          <DateTimePicker
            label="Date"
            date={query.dueDateBefore ? toUtc(query.dueDateBefore) : undefined}
            onChange={(value) => onDateFieldChange("dueDateBefore" || '', new Date(value.toDate()))}
          />
        </InlineField>
      </InlineFieldRow>
      <InlineFieldRow>
        <div>
          <h3>Filters</h3>
          {filters.map((filter, index) => (
            <InlineFieldRow key={index}>
              <InlineField label="Field" grow>
                <Select
                  options={fields.map((field) => ({ label: field, value: field }))}
                  value={filter.field}
                  onChange={(selected) =>
                    updateFilter(index, { ...filter, field: selected.value || '' })
                  }
                  placeholder="Select a field"
                  width={30}
                />
              </InlineField>
              <InlineField label="Value" grow>
                <AsyncSelect
                  value={filter.field ? { label: filter.value, value: filter.value } : null}
                  loadOptions={async (input) => {
                    const options = await loadFilterValueOptions(filter.field);
                    return options;
                  }}
                  onChange={(selected) =>
                    updateFilter(index, { ...filter, value: selected.value || '' })
                  }
                  placeholder="Enter value"
                  width={75}
                />
              </InlineField>
              <InlineField>
                <Button
                  variant="destructive"
                  onClick={() => removeFilter(index)}
                  icon="trash-alt"
                  title="Remove filter"
                />
              </InlineField>
            </InlineFieldRow>
          ))}
          <Button
            icon="plus"
            onClick={addFilter}
            title="Add filter"
          >
            Add Filter
          </Button>
        </div>
      </InlineFieldRow>
    </div>
  );
};
