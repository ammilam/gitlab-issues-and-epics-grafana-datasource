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
    const { groupBy, aggregateFunction, typeFilter = "issue", filters, createdAfter = null, createdBefore = null, updatedAfter = null, updatedBefore = null, closedAfter = null, closedBefore = null, regexFilters} = options.targets[0];
    const { issues, epics } = await this.getIssuesAndEpics(this.groupId);
    let data = typeFilter === "issue" ? issues : epics;
    let initialDataFrames = this.convertToDataFrames(data, groupBy, typeFilter);
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
        typeFilter || "",
        regexFilters || []
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
      'due_date',
      'start_date',
      'epic_state',
      'epic_c3',
      'epic_channel',
      'epic_rank',
      'epic_assignees',
    ];
  }

  getDiffInDays(date1: Date, date2: Date): string {
    const diffInMs = Math.abs(date1.getTime() - date2.getTime());
    let res = Math.ceil(diffInMs / (1000 * 60 * 60 * 24));
    return String(res)
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
  async getIssuesAndEpics(groupId: number): Promise<{ issues: any[]; epics: any[], issueFieldValuesDictionary: {}, epicFieldValuesDictionary: {} }> {
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


      let epics = [];
      type EpicObjectType = {
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
        description: string,
        group_id: string,
        epic_state: string,
        epic_c3: string,
        epic_channel: string,
        epic_rank: string,
        epic_assignees: string,
        Value: number,
        [key: string]: any; // This is the index signature
      };
      let epicFieldValuesDictionary: Record<string, ValueTypes[]> = {};

      let issues = [];
      type ValueTypes = string | number | boolean | Date | string[]; // Add here any other type that might appear in your obj.
      type IssueObjectType = {
        Time: Date,
        id: string,
        title: string,
        state: string,
        workflow_state: string,
        workflow_issue_type: string,
        project_id: string,
        assignee: string,
        assignees: string[],
        closed_by: string,
        milestone: string,
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
        epic_due_date: Date,
        epic_id: string,
        epic_title: string,
        epic_url: string

        [key: string]: any; // This is the index signature
      };

      let issueFieldValuesDictionary: Record<string, ValueTypes[]> = {};

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
          let created_month_number = String(createdDateData.monthNumber) || ""
          let created_year = String(createdDateData.year) || ""
          let updated_at = issue.updated_at || ""
          let updatedDateData = this.getDateInfo(new Date(updated_at))
          let updated_month = updatedDateData.monthName
          let updated_month_number = String(updatedDateData.monthNumber) || ""
          let updated_year = String(updatedDateData.year) || ""
          let closed_at = issue.closed_at ? issue.closed_at : ""
          let closedDateData = this.getDateInfo(new Date(closed_at))
          let closed_month = issue.closed_at ? closedDateData.monthName : ""
          let closed_month_number = issue.closed_at ? String(closedDateData.monthNumber) : ""
          let closed_year = issue.closed_at ? String(closedDateData.year) : ""
          let due_date = issue.due_date ? issue.due_date.split("T")[0] : ""
          let epic_due_date = issue.epic.human_readable_end_date ? issue.epic.human_readable_end_date.split("T")[0] : ""
          let epic_id = issue.epic.iid ? issue.epic.iid : ""
          let epic_title = issue.epic.title ? issue.epic.title : "No Epic Assigned"
          let epic_url = issue.epic.url ? issue.epic.url : ""
          let ticket_age = !closed_at ? this.getDiffInDays(new Date(created_at), new Date()) : this.getDiffInDays(new Date(created_at), new Date(closed_at))
          let assignee = issue.assignee.username ? issue.assignee.name : ""
          let assignees = issue.assignees ? issue.assignees.map((assignee: any) => assignee.name) : []
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

          let issueObj: IssueObjectType = {
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

          issues.push(issueObj);
          Object.keys(issueObj).forEach((key) => {

            // create an array containing all the values for a field, push it to the objectFieldValues dictionary
            if (issueFieldValuesDictionary[key]) {
              issueFieldValuesDictionary[key].push(issueObj[key]);
            }
            else {
              issueFieldValuesDictionary[key] = [issueObj[key]];
            }
          });

        }
      }

      let epicResponseUrl = `${this.apiUrl}/api/v4/groups/${groupId}/epics?per_page=100`;
      let groupEpics = await fetchAllPages(epicResponseUrl);
      for (const epic of groupEpics) {
        
        
        // find all the child issues of an epic, and create an array from the assignees
        let epic_labels = epic.labels
        let epic_state;
        let epic_c3;
        let epic_channel;
        let epic_rank;

        switch (true) {
          case epic_labels.includes('Epic Stage::In Progress'):
            epic_state = 'In Progress';
            break;
          case epic_labels.includes('Epic Stage::New'):
            epic_state = 'New';
            break;
          case epic_labels.includes('Epic Stage::QA'):
            epic_state = 'QA';
            break;
          case epic_labels.includes('Epic Stage::Ready for Development'):
            epic_state = 'Ready for Development';
            break;
          case epic_labels.includes('Epic Stage::Ready for Prod'):
            epic_state = 'Ready for Prod';
            break;
          case epic_labels.includes('Epic Stage::Requirement Gathering'):
            epic_state = 'Requirement Gathering';
            break;
          default:
            epic_state = 'Unassigned Epic State';
        }

        switch (true) {
          case epic_labels.includes('C³ - Cloud Strategy'):
            epic_c3 = 'Cloud Strategy';
            break;
          case epic_labels.includes('C³ - Cost Savings'):
            epic_c3 = 'Cost Savings';
            break;
          case epic_labels.includes('C³ - Customer'):
            epic_c3 = 'Customer';
            break;
          default:
            epic_c3 = 'No C3';
        }

        switch (true) {
          case epic_labels.includes('Channel::Enterprise'):
            epic_channel = 'Enterprise Project';
            break;
          case epic_labels.includes('Channel::CF'):
            epic_channel = 'Internal CF Project';
            break;
          case epic_labels.includes('Channel::Non-Project Related'):
            epic_channel = 'Non-Project Related';
            break;
          default:
            epic_channel = 'No Channel Listed';
        }

        switch (true) {
          case epic_labels.includes('Epic Rank::1'):
            epic_rank = '1';
            break;
          case epic_labels.includes('Epic Rank::2'):
            epic_rank = '2';
            break;
          case epic_labels.includes('Epic Rank::3'):
            epic_rank = '3';
            break;
          case epic_labels.includes('Epic Rank::4'):
            epic_rank = '4';
            break;
          case epic_labels.includes('Epic Rank::5'):
            epic_rank = '5';
            break;
          default:
            epic_rank = 'Not Ranked';
        }

        let created_at = epic.created_at
        let createdDateData = this.getDateInfo(new Date(created_at))
        let created_month = createdDateData.monthName
        let created_month_number = String(createdDateData.monthNumber) || ""
        let created_year = String(createdDateData.year) || ""
        let updated_at = epic.updated_at || ""
        let updatedDateData = this.getDateInfo(new Date(updated_at))
        let updated_month = updatedDateData.monthName
        let updated_month_number = String(updatedDateData.monthNumber) || ""
        let updated_year = String(updatedDateData.year) || ""
        let closed_at = epic.closed_at ? epic.closed_at : ""
        let closedDateData = this.getDateInfo(new Date(closed_at))
        let closed_month = epic.closed_at ? closedDateData.monthName : ""
        let closed_month_number = epic.closed_at ? String(closedDateData.monthNumber) : ""
        let closed_year = epic.closed_at ? String(closedDateData.year) : ""
        let due_date = epic.due_date ? epic.due_date.split("T")[0] : ""
        let start_date = epic.start_date ? epic.start_date.split("T")[0] : ""
        let end_date = epic.end_date ? epic.end_date.split("T")[0] : ""
        let group_id = epic.group_id ? epic.group_id : ""
        let id = epic.iid ? epic.iid : ""
        let title = epic.title ? epic.title : ""

       // get an epics issues and create an array from the assignees
        let findChildIssues = issues.filter((issue) => issue.epic_title === String(title)) || []
        let epic_assignees = findChildIssues.map((issue) => issue.assignees).flat(1) || []
        // ensure that the assignees array is unique
        epic_assignees = [...new Set(epic_assignees)]
        let strEpicAssignees = epic_assignees.join(", ")
        
        let epicObj: EpicObjectType = {
          Time: created_at,
          id: id,
          title: title,
          state: epic.state,
          epic_state: epic_state,
          type: "epic",
          group_id: group_id,
          created_at: created_at,
          created_month: created_month,
          created_month_number: created_month_number,
          created_year: created_year,
          updated_at: updated_at,
          updated_month: updated_month,
          updated_month_number: updated_month_number,
          updated_year: updated_year,
          closed_at: closed_at,
          closed_month: closed_month,
          closed_month_number: closed_month_number,
          closed_year: closed_year,
          closed_by: epic.closed_by,
          start_date: start_date,
          end_date: end_date,
          due_date: due_date,
          description: epic.description,
          epic_c3: epic_c3,
          epic_channel: epic_channel,
          epic_rank: epic_rank,
          epic_assignees: strEpicAssignees,
          Value: 1
        }

        epics.push(epicObj);

        Object.keys(epicObj).forEach((key) => {
          // create an array containing all the values for a field, push it to the objectFieldValues dictionary
          if (epicFieldValuesDictionary[key]) {
            epicFieldValuesDictionary[key].push(epicObj[key]);
          }
          else {
            epicFieldValuesDictionary[key] = [epicObj[key]];
          }
        }
        );
      }

      return { issues, epics, issueFieldValuesDictionary, epicFieldValuesDictionary };
    } catch (error) {
      alert(error);
      throw new Error('Failed to fetch issues and epics from Gitlab API');
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

    if (typeFilter === "issue") {
      for (const issue of data) {
        if (groupBy && groupBy.length > 0 && groupBy.includes("assignee")) {
          for (const assignee of issue['assignees']) {
            issueFrame.appendRow([issue['Time'], issue['id'], issue['title'], issue['state'], issue['workflow_state'], issue['type'], issue['workflow_issue_type'], issue['project_id'], issue['created_at'], issue['created_month'], issue['created_month_number'], issue['created_year'], issue['updated_at'], issue['updated_month'], issue['updated_month_number'], issue['updated_year'], issue['closed_at'], issue['closed_month'], issue['closed_month_number'], issue['closed_year'], issue['closed_by'], issue['milestone'], issue['description'], issue['author'], assignee, issue['labels'], issue['time_estimate'], issue['time_spent'], issue['epic_id'], issue['epic_title'], issue['epic_url'], issue['epic_due_date'], issue['due_date'], issue['ticket_age'], issue['Value']]);
          }
        } else {
          issueFrame.appendRow([issue['Time'], issue['id'], issue['title'], issue['state'], issue['workflow_state'], issue['type'], issue['workflow_issue_type'], issue['project_id'], issue['created_at'], issue['created_month'], issue['created_month_number'], issue['created_year'], issue['updated_at'], issue['updated_month'], issue['updated_month_number'], issue['updated_year'], issue['closed_at'], issue['closed_month'], issue['closed_month_number'], issue['closed_year'], issue['closed_by'], issue['milestone'], issue['description'], issue['author'], issue['assignee'], issue['labels'], issue['time_estimate'], issue['time_spent'], issue['epic_id'], issue['epic_title'], issue['epic_url'], issue['epic_due_date'], issue['due_date'], issue['ticket_age'], issue['Value']]);
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
        { name: 'due_date', type: FieldType.time },
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
        { name: 'epic_assignees', type: FieldType.string },
        { name: 'Value', type: FieldType.number }
      ]
    });

    if (typeFilter === "epic") {
      for (const epic of data) {
        epicFrame.appendRow([new Date(epic['Time']), epic['id'], epic['title'], epic['state'], epic['type'], epic['group_id'], new Date(epic['start_date']), new Date(epic['due_date']), epic['created_at'], epic['created_month'], epic['created_month_number'], epic['created_year'], epic['updated_at'], epic['updated_month'], epic['updated_month_number'], epic['updated_year'], epic['closed_at'], epic['closed_month'], epic['closed_month_number'], epic['closed_year'], epic['closed_by'], epic['description'], epic['author'], epic['assignee'], epic['labels'], epic['epic_state'], epic['epic_c3'], epic['epic_channel'], epic['epic_rank'], epic['epic_assignees'], epic['Value']]);
      }
    }
    let frame = typeFilter === "issue" ? issueFrame : epicFrame
    return [frame];
  }
}
