import { DataQuery, DataSourceJsonData } from '@grafana/data';

export type Filter = {
  field: string;
  value: string;
};

export interface MyQuery extends DataQuery {
  queryText?: string;
  constant: number;
  customTitle?: string;
  keyword?: string;
  groupBy: string[]; // new field to hold multiple groupBy fields
  refId: string;
  aggregateFunction?: string;
  typeFilter?: string;
  createdAfter?: Date | null;
  createdBefore?: Date | null;
  updatedAfter?: Date | null;
  updatedBefore?: Date | null;
  closedAfter?: Date | null;
  closedBefore?: Date | null;
  dueDateFrom?: Date | null;
  dueDateTo?: Date | null;
  filters?: Filter[]
  field?: string;
}

/**
 * These are options configured for each DataSource instance
 */
export interface MyDataSourceOptions extends DataSourceJsonData {
  apiUrl: string;
  groupId: number;
  accessToken: string;
}

export interface MyRow {
  [key: string]: number;
}

