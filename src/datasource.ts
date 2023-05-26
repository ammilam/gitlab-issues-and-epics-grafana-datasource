import { FieldType, MutableDataFrame, DataQueryRequest, DataQueryResponse, DataSourceApi, DataSourceInstanceSettings } from '@grafana/data';
import { MyDataSourceOptions, MyQuery } from './types';

export class DataSource extends DataSourceApi<MyQuery, MyDataSourceOptions> {
  apiUrl: string;
  accessToken: string;
  groupId: number;

  constructor(instanceSettings: DataSourceInstanceSettings<MyDataSourceOptions>) {
    super(instanceSettings);

    this.apiUrl = instanceSettings.jsonData.apiUrl || '';
    this.accessToken = instanceSettings.jsonData.accessToken || '';
    this.groupId = instanceSettings.jsonData.groupId;

  }

  async getUniqueFieldValues(field: string, allData: any[]): Promise<string[]> {
    const uniqueFieldValuesSet = allData.reduce((uniqueValues, item) => {
      let fieldValue;

      if (!item[field]) {
        return uniqueValues;
      } else {
        fieldValue = item[field];
      }

      if (fieldValue) {
        uniqueValues.add(fieldValue);
      }
      return uniqueValues;
    }, new Set<string>());

    return Array.from(uniqueFieldValuesSet);
  }

  async query(options: DataQueryRequest<MyQuery>): Promise<DataQueryResponse> {
    const { groupBy, aggregateFunction, typeFilter, filters, createdAfter = null, createdBefore = null, updatedAfter = null, updatedBefore = null, closedAfter = null, closedBefore = null } = options.targets[0];
    const { issues, epics } = await this.getIssuesAndEpics(this.groupId);
    let initialDataFrames = this.convertToDataFrames(issues, epics, groupBy);

    let filteredDataFrames = initialDataFrames;

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
      );
    }
    const response = { data: filteredDataFrames };
    return response;
  }

  applyTypeFilter(
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

  applyGroupByAndAggregate(
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
    typeFilter?: string
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
          isRowMatchingFilters
        ) {
          const groupValues = groupBy.map((field) => row[field] ?? 'N/A').join('|');
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

  fDate(date: Date) {
    return new Date(date).toTimeString()
  }

  applyDateFilter(
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


  async testDatasource() {
    try {
      const groupId = this.groupId;
      const url = this.apiUrl
      const response = await fetch(`${url}/api/v4/groups/${groupId}`, {
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
    } catch (error) {
      console.error(error);
      return {
        status: 'error',
        message: 'Failed to connect to Gitlab API',
      };
    }
  }

  get issueAndEpicFields(): string[] {
    return [
      'id',
      'title',
      'state',
      'type',
      'project_id',
      'closed_by',
      'milestone',
      'description',
      'author',
      'assignee',
      'time_estimate',
      'time_spent',
      'epic_id',
      'epic_title',
      'epic_url',
      'workflow_issue_type',
      'workflow_state',
      'ticket_age',
      'created_at',
      'created_month',
      'created_month_number',
      'created_year',
      'updated_month',
      'updated_month_number',
      'updated_year',
      'updated_at',
      'closed_month',
      'closed_month_number',
      'closed_year',
      'closed_at',
    ];
  }

  getDiffInDays(date1: Date, date2: Date): number {
    const diffInMs = Math.abs(date1.getTime() - date2.getTime());
    return Math.ceil(diffInMs / (1000 * 60 * 60 * 24));
  }

  getDateInfo = (date: Date): { monthName: string, monthNumber: number, year: number } => {
    const monthNumberInYear = date.getMonth();
    const year = date.getFullYear();
    const monthNumber = monthNumberInYear + 1;
    const monthName = date.toLocaleString('default', { month: 'long' });
    let obj = { monthName, monthNumber, year }
    return obj
  };


  // Get all issues and epics for a group
  async getIssuesAndEpics(groupId: number): Promise<{ issues: any[]; epics: any[] }> {
    let url;
    url = `${this.apiUrl}/api/v4/groups/${groupId}`
    try {
      const projectResponse = await fetch(url, {
        headers: {
          'PRIVATE-TOKEN': `${this.accessToken}`,
        },
      });
      const res = await projectResponse.json()
      const projects = res['projects']
      let issues = [];
      let epics = [];

      const fetchAllPages = async (url: string) => {
        let results = [];
        let page = 1;
        let hasNextPage = true;

        while (hasNextPage) {
          const response = await fetch(`${url}&page=${page}`, {
            headers: {
              'PRIVATE-TOKEN': `${this.accessToken}`,
            },
          });
          const data = await response.json();
          if (data && data.length > 0) {
            results.push(...data);
            page++;
          } else {
            hasNextPage = false;
          }
        }
        return results;
      };

      for (const project of projects) {
        let issuesUrl = project['_links']['issues'] + "?per_page=100";
        let projectIssues = await fetchAllPages(issuesUrl);
        for (const issue of projectIssues) {
          if (!issue.assignee) {
            issue.assignee = { username: "unassigned" }
          }
          if (!issue.closed_by) {
            issue.closed_by = { username: "" }
          }
          if (!issue.epic) {
            issue.epic = { id: 0, title: null, url: null, human_readable_end_date: null }
          }
          if (!issue.labels) {
            issue.labels = []
          }
          let labels = issue.labels
          let workflow_issue_type;
          let workflow_state;


          switch (true) {
            case labels.includes('IssueType::Research Spike'):
              workflow_issue_type = 'Research Spike';
              break;
            case labels.includes('IssueType::Bug'):
              workflow_issue_type = 'Bug';
              break;
            case labels.includes('IssueType::Story'):
              workflow_issue_type = 'Story';
              break;
            case labels.includes('IssueType::Knowledge Transfer'):
              workflow_issue_type = 'Knowledge Transfer';
              break;
            case labels.includes('IssueType::Testing Task'):
              workflow_issue_type = 'Testing Task';
              break;
            default:
              workflow_issue_type = 'Unassigned IssueType';
          }

          switch (true) {
            case labels.includes('Workflow::CF Backlog'):
              workflow_state = 'Backlog';
              break;
            case labels.includes('Workflow::In Progress'):
              workflow_state = 'In Progress';
              break;
            case labels.includes('Workflow::Blocked'):
              workflow_state = 'Blocked';
              break;
            case labels.includes('Workflow::Pending Verification'):
              workflow_state = 'Pending Verification';
              break;
            case labels.includes('Workflow::Complete'):
              workflow_state = 'Complete';
              break;
            default:
              workflow_state = 'Unassigned State';
          }
          let created_at = issue.created_at
          let createdDateData = this.getDateInfo(new Date(created_at))
          let created_month = createdDateData.monthName
          let created_month_number = createdDateData.monthNumber
          let created_year = createdDateData.year
          let updated_at = issue.updated_at
          let updatedDateData = this.getDateInfo(new Date(updated_at))
          let updated_month = updatedDateData.monthName
          let updated_month_number = updatedDateData.monthNumber
          let updated_year = updatedDateData.year
          let closed_at = issue.closed_at ? issue.closed_at : ""
          let closedDateData = this.getDateInfo(new Date(closed_at))
          let closed_month = issue.closed_at ? closedDateData.monthName : ""
          let closed_month_number = issue.closed_at ? closedDateData.monthNumber : ""
          let closed_year = issue.closed_at ? closedDateData.year : ""
          let due_date = issue.due_date ? issue.due_date.split("T")[0] : ""
          let epic_due_date = issue.epic.human_readable_end_date ? issue.epic.human_readable_end_date.split("T")[0] : ""
          let epic_id = issue.epic.iid ? issue.epic.iid : ""
          let epic_title = issue.epic.title ? issue.epic.title : "No Epic Assigned"
          let epic_url = issue.epic.url ? issue.epic.url : ""
          let ticket_age = !closed_at ? this.getDiffInDays(new Date(created_at), new Date()) : this.getDiffInDays(new Date(created_at), new Date(closed_at))
          let assignee = issue.assignee.username ? issue.assignee.username : ""
          let assignees = issue.assignees ? issue.assignees.map((assignee: any) => assignee.username) : []
          let closed_by = issue.closed_by.username ? issue.closed_by.username : ""
          let milestone = issue.milestone ? issue.milestone : ""
          let description = issue.description ? issue.description : ""
          let author = issue.author.username ? issue.author.username : ""
          let id = issue.iid ? issue.iid : ""
          let title = issue.title ? issue.title : ""
          let issue_state = issue.state ? issue.state : ""
          let project_id = issue.project_id ? issue.project_id : ""
          let time_estimate = issue['time_stats']['time_estimate'] ? issue['time_stats']['time_estimate'] : ""
          let total_time_spent = issue['time_stats']['total_time_spent'] ? issue['time_stats']['total_time_spent'] : ""
          let type = "issue"
          let Value = 1

          let obj = {
            Time: issue.created_at,
            id: id,
            title: title,
            state: issue_state,
            workflow_state: workflow_state,
            workflow_issue_type: workflow_issue_type,
            project_id: project_id,
            assignee: assignee,
            assignees: assignees,
            closed_by: closed_by,
            milestone: milestone,
            description: description,
            time_estimate: time_estimate,
            total_time_spent: total_time_spent,
            author: author,
            type: type,
            Value: Value,
            ticket_age: ticket_age,
            updated_at: updated_at,
            updated_month: updated_month,
            updated_month_number: updated_month_number,
            updated_year: updated_year,
            closed_at: closed_at,
            closed_month: closed_month,
            closed_month_number: closed_month_number,
            closed_year: closed_year,
            created_at: created_at,
            created_month: created_month,
            created_month_number: created_month_number,
            created_year: created_year,
            due_date: due_date,
            epic_due_date: epic_due_date,
            epic_id: epic_id,
            epic_title: epic_title,
            epic_url: epic_url
          }
          issues.push(obj);
        }
      }

      let epicResponseUrl = `${this.apiUrl}/api/v4/groups/${groupId}/epics?per_page=100`;
      let groupEpics = await fetchAllPages(epicResponseUrl);
      epics.push(...groupEpics);
      return { issues, epics };
    } catch (error) {
      alert(error);
      throw new Error('Failed to fetch issues and epics from Gitlab API');
    }
  }

  convertToDataFrames(issues: any[], epics: any[], groupBy: string[]): MutableDataFrame[] {
    const issueFrame = new MutableDataFrame({
      refId: 'data',
      fields: [
        { name: 'Time', type: FieldType.time },
        { name: 'id', type: FieldType.string },
        { name: 'title', type: FieldType.string },
        { name: 'state', type: FieldType.string },
        { name: 'workflow_state', type: FieldType.string },
        { name: 'type', type: FieldType.string },
        { name: 'workflow_issue_type', type: FieldType.string },
        { name: 'project_id', type: FieldType.string },
        { name: 'created_at', type: FieldType.string },
        { name: 'created_month', type: FieldType.string },
        { name: 'created_month_number', type: FieldType.number },
        { name: 'created_year', type: FieldType.number },
        { name: 'updated_at', type: FieldType.string },
        { name: 'updated_month', type: FieldType.string },
        { name: 'updated_month_number', type: FieldType.number },
        { name: 'updated_year', type: FieldType.number },
        { name: 'closed_at', type: FieldType.string },
        { name: 'closed_month', type: FieldType.string },
        { name: 'closed_month_number', type: FieldType.number },
        { name: 'closed_year', type: FieldType.number },
        { name: 'closed_by', type: FieldType.string },
        { name: 'milestone', type: FieldType.string },
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
        { name: 'Value', type: FieldType.number }
      ],
    });

    for (const issue of issues) {

      if (groupBy && groupBy.length > 0 && groupBy.includes("assignee")) {
        for (const assignee of issue['assignees']) {
          issueFrame.appendRow([issue['Time'], issue['id'], issue['title'], issue['state'], issue['workflow_state'], issue['type'], issue['workflow_issue_type'], issue['project_id'], issue['created_at'], issue['created_month'], issue['created_month_number'], issue['created_year'], issue['updated_at'], issue['updated_month'], issue['updated_month_number'], issue['updated_year'], issue['closed_at'], issue['closed_month'], issue['closed_month_number'], issue['closed_year'], issue['closed_by'], issue['milestone'], issue['description'], issue['author'], assignee, issue['labels'], issue['time_estimate'], issue['time_spent'], issue['epic_id'], issue['epic_title'], issue['epic_url'], issue['epic_due_date'], issue['due_date'], issue['ticket_age'], issue['Value']]);
        }
      } else {
        issueFrame.appendRow([issue['Time'], issue['id'], issue['title'], issue['state'], issue['workflow_state'], issue['type'], issue['workflow_issue_type'], issue['project_id'], issue['created_at'], issue['created_month'], issue['created_month_number'], issue['created_year'], issue['updated_at'], issue['updated_month'], issue['updated_month_number'], issue['updated_year'], issue['closed_at'], issue['closed_month'], issue['closed_month_number'], issue['closed_year'], issue['closed_by'], issue['milestone'], issue['description'], issue['author'], issue['assignee'], issue['labels'], issue['time_estimate'], issue['time_spent'], issue['epic_id'], issue['epic_title'], issue['epic_url'], issue['epic_due_date'], issue['due_date'], issue['ticket_age'], issue['Value']]);
      }
    }
    // for (const epic of epics) {
    //   frame.add({ id: epic.iid, Time: epic.created_at, Value: 1, type: "epic", project_id: epic.project_id });
    // }
    return [issueFrame];
  }
}
