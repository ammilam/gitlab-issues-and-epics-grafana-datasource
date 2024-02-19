import { FieldType, MutableDataFrame, DataQueryRequest, DataQueryResponse, DataSourceApi, DataSourceInstanceSettings } from '@grafana/data';
import { MyDataSourceOptions, MyQuery, LocalData } from './types';
import { getTemplateSrv } from '@grafana/runtime';
import { getDiffInDays as DiffDays, getDateInfo as DateInfo } from 'lib/dates';
import { formatName as NameFormat, fDate as FormatDate } from 'lib/format';
import { getIssuesAndEpicsGraphql, getIssuesAndEpicsRest, getIssuesAndEpicsGitbreakerClient, getIssuesAndEpicsExpress } from 'lib/api';
import { applyDateFilter as DateFilter, applyTypeFilter as TypeFilter } from 'lib/filtering';
import { applyGroupByAndAggregate as GroupByAndAggregate } from 'lib/aggregation';


// Singleton Cache
class Cache {
  static instance: Cache;
  static localData: LocalData = {
    issues: [],
    epics: [],
    issueFieldValuesDictionary: {},
    epicFieldValuesDictionary: {},
  };

  static lastRefreshed: Date | null = null;

  apiUrl?: string;
  apiCallType?: string;
  groupId?: number;
  groupName?: string;
  accessToken?: string;
  refreshInterval: number = 60 * 60 * 1000; // 1 hour
  dataRefreshPromise: Promise<void> | null = null;

  constructor(apiUrl: string, groupId: number, accessToken: string, apiCallType?: string, groupName?: string) {
    if (Cache.instance) {
      return Cache.instance;
    }

    this.apiUrl = apiUrl;
    this.groupId = groupId;
    this.accessToken = accessToken;
    this.apiCallType = apiCallType || '';
    this.groupName = groupName || '';
    this.initializePeriodicRefresh();

    Cache.instance = this;
  }

  initializePeriodicRefresh() {
    this.refreshData();
    setInterval(() => this.refreshData(), this.refreshInterval);
  }

  async fetchData(): Promise<LocalData> {
    if (!Cache.lastRefreshed || !this.isCacheValid()) {
      if (!this.dataRefreshPromise) {
        this.dataRefreshPromise = this.refreshData();
      }
      await this.dataRefreshPromise;
    }
    return Cache.localData;
  }

  isCacheValid(): boolean {
    const currentTime = new Date().getTime();
    const lastRefreshedTime = Cache.lastRefreshed?.getTime() || 0;
    return (currentTime - lastRefreshedTime) <= this.refreshInterval;
  }

  async refreshData(): Promise<void> {

    // const data = this.apiCallType === "rest" ? await getIssuesAndEpicsRest(this.apiUrl || '', this.groupId || 0, this.accessToken || '') : await getIssuesAndEpicsGraphql(this.apiUrl || '', this.groupName || '', this.accessToken || '');
    let data: any;

    switch (this.apiCallType) {
      case "rest":
        data = await getIssuesAndEpicsRest(this.apiUrl || '', this.groupId || 0, this.accessToken || '');
        break;
      case "graphql":
        data = await getIssuesAndEpicsGraphql(this.apiUrl || '', this.groupName || '', this.accessToken || '');
        break;
      case "gitbreaker":
        data = await getIssuesAndEpicsGitbreakerClient(this.apiUrl || '', this.groupId || 0, this.accessToken || '');
        break;
      case "express":
        data = await getIssuesAndEpicsExpress(this.apiUrl || '', this.groupId || 0);
        break;
      default:
        data = await getIssuesAndEpicsRest(this.apiUrl || '', this.groupId || 0, this.accessToken || '');
    }

    Cache.localData = {
      issues: data.issues,
      epics: data.epics,
      issueFieldValuesDictionary: data.issueFieldValuesDictionary,
      epicFieldValuesDictionary: data.epicFieldValuesDictionary,
    };

    Cache.lastRefreshed = new Date();
    this.dataRefreshPromise = null;
  }
}


export class DataSource extends DataSourceApi<MyQuery, MyDataSourceOptions> {
  apiUrl: string;
  apiCallType?: string;
  accessToken: string;
  groupId: number;
  groupName?: string;
  private cache: Cache;

  localData: LocalData = {
    issues: [],
    epics: [],
    issueFieldValuesDictionary: {},
    epicFieldValuesDictionary: {},
  };

  formatName = NameFormat;
  getDateInfo = DateInfo;
  getDiffInDays = DiffDays;
  applyDateFilter = DateFilter;
  applyTypeFilter = TypeFilter;
  applyGroupByAndAggregate = GroupByAndAggregate;
  fDate = FormatDate;


  constructor(instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    super(instanceSettings);

    this.apiUrl = instanceSettings.jsonData.apiUrl || '';
    this.apiCallType = instanceSettings.jsonData.apiCallType || '';
    this.accessToken = instanceSettings.jsonData.accessToken || '';
    this.groupId = instanceSettings.jsonData.groupId || 0;
    this.groupName = instanceSettings.jsonData.groupName || '';
    this.cache = new Cache(this.apiUrl, this.groupId, this.accessToken, this.apiCallType, this.groupName);
  }

  async query(options: DataQueryRequest<MyQuery>): Promise<DataQueryResponse> {
    const { issues, epics } = await this.cache.fetchData()

    const { groupBy, aggregateFunction, typeFilter = "issue", filters, createdAfter = null, createdBefore = null, updatedAfter = null, updatedBefore = null, closedAfter = null, closedBefore = null, regexFilters } = options.targets[0];
    let data = typeFilter === "issue" ? issues : epics;
    let initialDataFrames = this.convertToDataFrames(data, groupBy, typeFilter);
    
    let filteredDataFrames = initialDataFrames;
    let interpolatedFilters = filters;

    // get variable values and replace them in the filters
    if (regexFilters) {
      interpolatedFilters = regexFilters.map(filter => {
        const interpolatedValue = getTemplateSrv().replace(filter.value, options.scopedVars);
        return { ...filter, value: interpolatedValue };
      });
    }

    // Apply the type filter
    if (typeFilter) {
      filteredDataFrames = this.applyTypeFilter(typeFilter, filteredDataFrames);
    }

    // Apply the date filter
    filteredDataFrames = this.applyDateFilter(createdAfter, createdBefore, updatedAfter, updatedBefore, closedAfter, closedBefore, filteredDataFrames);
    // Pass the filters array when calling applyGroupByAndAggregate
    if (groupBy && aggregateFunction) {
      filteredDataFrames = this.applyGroupByAndAggregate(
        groupBy,
        aggregateFunction,
        createdAfter || null,
        createdBefore || null,
        updatedAfter || null,
        updatedBefore || null,
        closedAfter || null,
        closedBefore || null,
        filteredDataFrames,
        filters || [],
        typeFilter || "",
        interpolatedFilters || [],
      );
    }

    const response = { data: filteredDataFrames };

    return response;
  }


  async testDatasource() {
    try {
      const groupId = this.groupId;
      const url = this.apiUrl
      const apiCallType = this.apiCallType
      let response: any;

      if (apiCallType === 'express') {
        response = await fetch(`${url}/health`, { credentials: 'include' })
        
        if (response.status === 200) {
          return {
            status: 'success',
            message: 'Connected to Gitlab: ' + JSON.stringify(response),
          };
        } else {
          const errorBody = await response.text(); // Attempt to read response body
          return {
            status: 'error',
            message: `HTTP error! status: ${response.status}, body: ${errorBody}`
          };
        }
      } else {
        response = await fetch(`${url}/api/v4/groups/${groupId}`, {
          headers: {
            'PRIVATE-TOKEN': `${this.accessToken}`,
          },
        });
        const group = await response.json();
        console.log(group)
        return {
          status: 'success',
          message: `Connected to Gitlab group: ${groupId}`,
        };
      }
    } catch (error) {
      console.error(error);
      return {
        status: 'error',
        message: 'Failed to connect to Gitlab API ' + error,
      };
    }
  }


  convertToDataFrames(data: any[], groupBy: string[], typeFilter: string): MutableDataFrame[] {
    const issueFrame = new MutableDataFrame({
      refId: 'data',
      fields: [
        { name: 'Time', type: FieldType.time },
        { name: 'id', type: FieldType.string },
        { name: 'title', type: FieldType.string },
        { name: 'state', type: FieldType.string },
        { name: 'story_ci', type: FieldType.string },
        { name: 'story_ci_type', type: FieldType.string },
        { name: 'workflow_state', type: FieldType.string },
        { name: 'type', type: FieldType.string },
        { name: 'workflow_issue_type', type: FieldType.string },
        { name: 'project_id', type: FieldType.string },
        { name: 'created_at', type: FieldType.time },
        { name: 'created_month', type: FieldType.string },
        { name: 'created_month_number', type: FieldType.string },
        { name: 'created_year', type: FieldType.string },
        { name: 'updated_at', type: FieldType.time },
        { name: 'updated_month', type: FieldType.string },
        { name: 'updated_month_number', type: FieldType.string },
        { name: 'updated_year', type: FieldType.string },
        { name: 'closed_at', type: FieldType.time },
        { name: 'closed_month', type: FieldType.string },
        { name: 'closed_month_number', type: FieldType.string },
        { name: 'closed_year', type: FieldType.string },
        { name: 'closed_by', type: FieldType.string },
        { name: 'milestone', type: FieldType.string },
        { name: 'iteration_start_date', type: FieldType.string },
        { name: 'iteration_due_date', type: FieldType.string },
        { name: 'iteration_name', type: FieldType.string },
        { name: 'sprintStartDate', type: FieldType.string },
        { name: 'sprintEndDate', type: FieldType.string },
        { name: 'daysLeftInSprint', type: FieldType.string },
        { name: 'description', type: FieldType.string },
        { name: 'author', type: FieldType.string },
        { name: 'assignee', type: FieldType.string },
        { name: 'labels', type: FieldType.other },
        { name: 'time_estimate', type: FieldType.string },
        { name: 'time_spent', type: FieldType.string },
        { name: 'epic_id', type: FieldType.string },
        { name: 'epic_title', type: FieldType.string },
        { name: 'epic_url', type: FieldType.string },
        { name: 'epic_due_date', type: FieldType.string },
        { name: 'due_date', type: FieldType.string },
        { name: 'ticket_age', type: FieldType.string },
        { name: 'updated_days', type: FieldType.string },
        { name: 'parent_channel', type: FieldType.string },
        { name: 'c3score', type: FieldType.number },
        { name: 'weight', type: FieldType.number },
        { name: 'Value', type: FieldType.number }
      ],
    });

    if (typeFilter === "issue") {
      for (const issue of data) {
        if (groupBy && groupBy.length > 0 && groupBy.includes("assignee") && issue.assignees && issue.assignees.length > 0) {
          for (const assignee of issue['assignees']) {
            issueFrame.appendRow([issue['Time'], issue['id'], issue['title'], issue['state'], issue['story_ci'], issue['story_ci_type'], issue['workflow_state'], issue['type'], issue['workflow_issue_type'], issue['project_id'], issue['created_at'], issue['created_month'], issue['created_month_number'], issue['created_year'], issue['updated_at'], issue['updated_month'], issue['updated_month_number'], issue['updated_year'], issue['closed_at'], issue['closed_month'], issue['closed_month_number'], issue['closed_year'], issue['closed_by'], issue['milestone'], issue['iteration_start_date'], issue['iteration_due_date'], issue['iteration_name'], issue['sprintStartDate'], issue['sprintEndDate'], issue['daysLeftInSprint'], issue['description'], issue['author'], this.formatName(assignee), issue['labels'], issue['time_estimate'], issue['time_spent'], issue['epic_id'], issue['epic_title'], issue['epic_url'], issue['epic_due_date'], issue['due_date'], issue['ticket_age'], issue['updated_days'], issue['parent_channel'], issue['c3score'], issue['weight'], issue['Value']]);
          }
        } else {
          issueFrame.appendRow([issue['Time'], issue['id'], issue['title'], issue['state'], issue['story_ci'], issue['story_ci_type'], issue['workflow_state'], issue['type'], issue['workflow_issue_type'], issue['project_id'], issue['created_at'], issue['created_month'], issue['created_month_number'], issue['created_year'], issue['updated_at'], issue['updated_month'], issue['updated_month_number'], issue['updated_year'], issue['closed_at'], issue['closed_month'], issue['closed_month_number'], issue['closed_year'], issue['closed_by'], issue['milestone'], issue['iteration_start_date'], issue['iteration_due_date'], issue['iteration_name'], issue['sprintStartDate'], issue['sprintEndDate'], issue['daysLeftInSprint'], issue['description'], issue['author'], issue['assignee'], issue['labels'], issue['time_estimate'], issue['time_spent'], issue['epic_id'], issue['epic_title'], issue['epic_url'], issue['epic_due_date'], issue['due_date'], issue['ticket_age'], issue['updated_days'], issue['parent_channel'], issue['c3score'], issue['weight'], issue['Value']]);
        }
      }
    }

    const epicFrame = new MutableDataFrame({
      refId: 'data',
      fields: [
        { name: 'Time', type: FieldType.time },
        { name: 'id', type: FieldType.string },
        { name: 'title', type: FieldType.string },
        { name: 'state', type: FieldType.string },
        { name: 'type', type: FieldType.string },
        { name: 'group_id', type: FieldType.string },
        { name: 'start_date', type: FieldType.time },
        { name: 'start_month', type: FieldType.string },
        { name: 'due_date', type: FieldType.time },
        { name: 'due_date_threshold', type: FieldType.string },
        { name: 'due_date_month', type: FieldType.string },
        { name: 'due_date_month_number', type: FieldType.string },
        { name: 'due_date_year', type: FieldType.string },
        { name: 'created_at', type: FieldType.time },
        { name: 'created_month', type: FieldType.string },
        { name: 'created_month_number', type: FieldType.string },
        { name: 'created_year', type: FieldType.string },
        { name: 'updated_at', type: FieldType.time },
        { name: 'updated_month', type: FieldType.string },
        { name: 'updated_month_number', type: FieldType.string },
        { name: 'updated_year', type: FieldType.string },
        { name: 'closed_at', type: FieldType.time },
        { name: 'closed_month', type: FieldType.string },
        { name: 'closed_month_number', type: FieldType.string },
        { name: 'closed_year', type: FieldType.string },
        { name: 'closed_by', type: FieldType.string },
        { name: 'description', type: FieldType.string },
        { name: 'author', type: FieldType.string },
        { name: 'assignee', type: FieldType.string },
        { name: 'labels', type: FieldType.other },
        { name: 'epic_state', type: FieldType.string },
        { name: 'epic_c3', type: FieldType.string },
        { name: 'epic_channel', type: FieldType.string },
        { name: 'epic_rank', type: FieldType.string },
        { name: 'epic_assignees', type: FieldType.other },
        { name: 'most_common_epic_assignee_filter', type: FieldType.string },
        { name: 'openissues', type: FieldType.number },
        { name: 'closedissues', type: FieldType.number },
        { name: 'totalissues', type: FieldType.number },
        { name: 'pctcomplete', type: FieldType.number },
        { name: 'numAssignees', type: FieldType.number },
        //O&I Metrics
        { name: 'epic_category', type: FieldType.string },
        { name: 'epic_priority', type: FieldType.string },
        { name: 'epic_pillar', type: FieldType.string },
        { name: 'Value', type: FieldType.number }
      ]
    });

    if (typeFilter === "epic") {
      for (const epic of data) {
        epicFrame.appendRow([new Date(epic['Time']), epic['id'], epic['title'], epic['state'], epic['type'], epic['group_id'], new Date(epic['start_date']), epic['start_month'], new Date(epic['due_date']), epic['due_date_threshold'], epic['due_date_month'], epic['due_date_month_number'], epic['due_date_year'], epic['created_at'], epic['created_month'], epic['created_month_number'], epic['created_year'], epic['updated_at'], epic['updated_month'], epic['updated_month_number'], epic['updated_year'], epic['closed_at'], epic['closed_month'], epic['closed_month_number'], epic['closed_year'], epic['closed_by'], epic['description'], epic['author'], epic['assignee'], epic['labels'], epic['epic_state'], epic['epic_c3'], epic['epic_channel'], epic['epic_rank'], epic['epic_assignees'], epic['most_common_epic_assignee_filter'], epic['openissues'], epic['closedissues'], epic['totalissues'], epic['pctcomplete'], epic['numAssignees'], epic['epic_category'], epic['epic_priority'], epic['epic_pillar'], epic['Value']]);
      }
    }

    let frame = typeFilter === "issue" ? issueFrame : epicFrame
    return [frame];

  }
}
