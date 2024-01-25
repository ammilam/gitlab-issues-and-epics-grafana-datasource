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
  dueDateAfter?: Date | null;
  dueDateBefore?: Date | null;
  filters?: Filter[]
  field?: string;
  regexFilters?: Filter[];
  rawQuery?: string;
}

/**
 * These are options configured for each DataSource instance
 */
export interface MyDataSourceOptions extends DataSourceJsonData {
  apiUrl: string;
  groupId: number;
  accessToken: string;

}

export interface MySecureJsonData {
  accessToken: string;
}

export interface MyRow {
  [key: string]: number;
}

export type IssueObjectType = {
  Time: Date,
  id: string,
  title: string,
  story_ci: string,
  story_ci_type: string,
  state: string,
  workflow_state: string,
  workflow_issue_type: string,
  project_id: string,
  assignee: string,
  assignees: string[],
  closed_by: string,
  milestone: string,
  iteration_start_date: Date,
  iteration_due_date: Date,
  description: string,
  time_estimate: string,
  total_time_spent: string,
  author: string,
  type: string,
  Value: number,
  ticket_age: string,
  updated_at: Date,
  updated_month: string,
  updated_month_number: string,
  updated_year: string,
  closed_at: Date,
  closed_month: string,
  closed_month_number: string,
  closed_year: string,
  created_at: Date,
  created_month: string,
  created_month_number: string,
  created_year: string,
  due_date: Date,
  due_date_threshold: string,
  parent_channel: string,
  c3score: number,
  epic_due_date: Date,
  epic_id: string,
  epic_title: string,
  epic_url: string

  [key: string]: any; // This is the index signature
};

export type ValueTypes = string | number | boolean | Date | string[]; // Add here any other type that might appear in your obj.
export type EpicObjectType = {
  Time: Date,
  id: string,
  title: string,
  state: string,
  type: string,
  created_at: Date,
  created_month: string,
  created_month_number: string,
  created_year: string,
  updated_at: Date,
  updated_month: string,
  updated_month_number: string,
  updated_year: string,
  closed_at: Date,
  closed_month: string,
  closed_month_number: string,
  closed_year: string,
  closed_by: string,
  start_date: Date,
  end_date: Date,
  due_date: Date,
  due_date_threshold: string,
  due_date_month: string,
  due_date_month_number: string,
  due_date_year: string,
  description: string,
  group_id: string,
  epic_state: string,
  epic_c3: string,
  epic_channel: string,
  epic_rank: string,
  epic_assignees: string,
  openissues: number,
  closedissues: number,
  totalissues: number,
  pctcomplete: number, 
  numAssignees: number,
  Value: number,
  [key: string]: any; // This is the index signature
};
