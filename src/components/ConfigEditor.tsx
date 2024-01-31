import React, { PureComponent } from 'react';

import { DataSourcePluginOptionsEditorProps, SelectableValue } from '@grafana/data';
import { InlineField, InlineFieldRow, Input, Select } from '@grafana/ui';
import { MyDataSourceOptions } from '../types';

interface Props extends DataSourcePluginOptionsEditorProps<MyDataSourceOptions> { }

interface State { }

export class ConfigEditor extends PureComponent<Props, State> {

  onApiUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { onOptionsChange, options } = this.props;
    onOptionsChange({ ...options, jsonData: { ...options.jsonData, apiUrl: event.target.value } });
  };

  onAccessTokenChange = (event: React.ChangeEvent<HTMLInputElement>) => {

    const { onOptionsChange, options } = this.props;

    onOptionsChange({ ...options, jsonData: { ...options.jsonData, accessToken: event.target.value } });

  };

  onGroupIdChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { onOptionsChange, options } = this.props;
    onOptionsChange({ ...options, jsonData: { ...options.jsonData, groupId: Number(event.target.value) } });
  };


  onGroupNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { onOptionsChange, options } = this.props;
    const updatedOptions = {
      ...options,
      jsonData: {
        ...options.jsonData,
        groupName: event.target.value,
      },
    };
    onOptionsChange(updatedOptions);
  };

  onApiCallTypeChange = (selected: SelectableValue<string>) => {
    let { onOptionsChange, options } = this.props;

    onOptionsChange({
      ...options, jsonData: {
        ...options.jsonData,
        apiCallType: selected.value,
      }
    });
  };

  render() {
    const { options } = this.props;
    return (
      <div>
        <InlineFieldRow>
          <InlineField label="Gitlab URL" labelWidth={14}>
            <Input
              type='text'
              width={30}
              value={options.jsonData.apiUrl}
              onChange={this.onApiUrlChange}
              placeholder="https://gitlab.com"
            />
          </InlineField>
        </InlineFieldRow>
        <InlineFieldRow>
          <InlineField label="Access Token" labelWidth={14}>
            <Input
              width={30}
              value={options.jsonData.accessToken}
              onChange={this.onAccessTokenChange}
              placeholder={options.jsonData.accessToken ? "configured" : "Enter a Gitlab Access Token"}
            />
          </InlineField>
        </InlineFieldRow>
        <InlineFieldRow>
          <InlineField label="Group ID" labelWidth={14}>
            <Input
              width={30}
              value={options.jsonData.groupId}
              onChange={this.onGroupIdChange} />
          </InlineField>
        </InlineFieldRow>
        <InlineFieldRow>
          <InlineField label="Group Name" labelWidth={14}>
            <Input
              width={30}
              value={options.jsonData.groupName}
              onChange={this.onGroupNameChange} />
          </InlineField>
        </InlineFieldRow>
        <InlineFieldRow>
          <InlineField label="API Call Type" labelWidth={14}>
            <Select
              options={[
                { label: 'rest', value: 'rest' },
                { label: 'graphql', value: 'graphql' },
                { label: 'gitbreaker', value: 'gitbreaker'},
                { label: 'express', value: 'express'}
              ]}
              value={options.jsonData.apiCallType}
              placeholder="Select API Call Type"
              onChange={this.onApiCallTypeChange}
            />
          </InlineField>
        </InlineFieldRow>
      </div>
    );
  }
}
