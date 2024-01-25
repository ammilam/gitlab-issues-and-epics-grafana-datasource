import React, { useState, useEffect, useCallback } from 'react';
import { SelectableValue, QueryEditorProps, toUtc } from '@grafana/data';
import { Select, MultiSelect, InlineField, InlineFieldRow, DateTimePicker, Button, AsyncMultiSelect } from '@grafana/ui';
import { DataSource } from '../datasource';
import { MyDataSourceOptions, MyQuery, Filter } from '../types';
import { issueAndEpicFields } from '../lib/constants';
type Props = QueryEditorProps<DataSource, MyQuery, MyDataSourceOptions>;


export const QueryEditor: React.FC<Props> = (props) => {

  const loadFieldOptions = useCallback(async (type: string): Promise<any> => {
    // Fetch the data once
    const { issueFieldValuesDictionary, epicFieldValuesDictionary } = await props.datasource.localData
    // const { issueFieldValuesDictionary, epicFieldValuesDictionary } = await props.datasource.getIssuesAndEpics(props.datasource.apiUrl, props.datasource.groupId, props.datasource.accessToken);

    let res = type === "issue" ? issueFieldValuesDictionary : epicFieldValuesDictionary;
    return res;

  }, [props.datasource]);

  const loadFilterValueOptions = async (field: string, dictionary: any) => {
    if (!field) {
      return [];
    }
    // Pass the data to the getUniqueFieldValues method
    const uniqueValues = dictionary[field] || [];
    const uniqueSet = new Set<string>(uniqueValues);

    // Convert back to array then map
    let obj = Array.from(uniqueSet).map((value: any) => ({ label: value, value }));

    return obj;
  };

  const { onChange, query } = props;
  // Set a default value for the typeFilter property
  query.typeFilter = query.typeFilter || 'issue';
  const type = query.typeFilter;
  query.aggregateFunction = query.aggregateFunction || 'count';
  if (!query.groupBy) {
    // Access the groupBy property
    query.groupBy = [];
  }
  // Declare the dictionary state.
  const [dictionary, setDictionary] = useState<any>({});
  useEffect(() => {
    (async () => {
      const newDictionary = await loadFieldOptions(type);
      setDictionary(newDictionary);
    })();
  }, [loadFieldOptions, type]);

  const [fields, setFields] = useState<string[]>([]);
  const [aggregateFunctions] = useState<string[]>(['count']);
  const [typeOptions] = useState<string[]>(['issue', 'epic']);
  query.createdAfter = query.createdAfter || null;
  query.createdBefore = query.createdBefore || null;
  useEffect(() => {
    // Get the fields from the data source
    const dataSourceFields = issueAndEpicFields;
    setFields(dataSourceFields);
  }, [props.datasource]);

  // Set a default value for the filters property
  query.filters = query.filters || [];
  query.regexFilters = query.regexFilters || [];

  // Initialize the filters state
  const [filters, setFilters] = useState<Filter[]>(query.filters);
  const [filterOptions, setFilterOptions] = useState<Array<Array<SelectableValue<string>>>>([]);
  const [regexFilters, setRegexFilters] = useState<Filter[]>(query.regexFilters);

  // Add event handlers for filters
  const addFilter = () => {
    setFilters([...filters, { field: '', value: '' }]);
  };

  const addRegexFilter = () => {
    setRegexFilters([...regexFilters, {field: '' , value: ''}]);
  };

  const updateFilter = async (index: number, updatedFilter: Filter) => {
    const newFilters = filters.map((filter, i) => (i === index ? updatedFilter : filter));
    setFilters(newFilters);
    onChange({ ...query, filters: newFilters });

    if (updatedFilter.field) {
      const dictionary = await fieldOptions;
      const newOptions = await loadFilterValueOptions(updatedFilter.field, dictionary);
      let newFilterOptions = [...filterOptions];
      newFilterOptions[index] = newOptions;
      setFilterOptions(newFilterOptions);
    }
  };

  const updateRegexFilter = (index: number, updatedRegexFilter: Filter) => {
    const newRegexFilters = regexFilters.map((regexFilter, i) => (i === index ? updatedRegexFilter : regexFilter));
    setRegexFilters(newRegexFilters);
    onChange({ ...query, regexFilters: newRegexFilters });
  };

  const removeFilter = (index: number) => {
    const newFilters = filters.filter((_, i) => i !== index);
    setFilters(newFilters);
    onChange({ ...query, filters: newFilters });
  };

  const removeRegexFilter = (index: number) => {
    const newRegexFilters = regexFilters.filter((_, i) => i !== index);
    setRegexFilters(newRegexFilters);
    onChange({ ...query, regexFilters: newRegexFilters });
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

  const fieldOptions = loadFieldOptions(type);

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
                <AsyncMultiSelect
                  value={
                    filter.field && typeof filter.value === 'string'
                      ? filter.value.split(',').map(value => ({ label: value, value: value }))
                      : []
                  }
                  defaultOptions={filterOptions[index]}
                  loadOptions={() => loadFilterValueOptions(filter.field, dictionary)}
                  onChange={(selected) =>
                    updateFilter(index, { ...filter, value: selected ? selected.map(option => option.value).join(',') : '' })
                  }
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
      <InlineFieldRow>
        <div>
          <h3>Regex Filters</h3>
          {regexFilters.map((regexFilter, index) => (
            <InlineFieldRow key={index}>
              <InlineField label="Field" grow>
                <Select
                  options={fields.map((field) => ({ label: field, value: field }))}
                  value={regexFilter.field}
                  onChange={(selected) =>
                    updateRegexFilter(index, { ...regexFilter, field: selected.value || '' })
                  }
                  placeholder="Select a field"
                  width={30}
                />
              </InlineField>
              <InlineField label="Regex Pattern">
                <input
                  type="text"
                  value={regexFilter.value}
                  onChange={(e) => updateRegexFilter(index, { ...regexFilter, value: e.target.value })}
                />
              </InlineField>
              <InlineField>
                <Button
                  variant="destructive"
                  onClick={() => removeRegexFilter(index)}
                  icon="trash-alt"
                  title="Remove filter"
                />
              </InlineField>
            </InlineFieldRow>
          ))}
          <Button
            icon="plus"
            onClick={addRegexFilter}
            title="Add filter"
          >
            Add Filter
          </Button>
          </div>
      </InlineFieldRow>
    </div>
  );
};
