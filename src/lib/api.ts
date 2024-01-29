import { EpicObjectType, IssueObjectType } from '../types';
import { getDiffInDays, getDateInfo } from 'lib/dates';
import { formatName } from './format';
import { findMostCommonElement, processGitlabData } from './processing';
import Bottleneck from 'bottleneck';
// import { Gitlab } from '@gitbeaker/rest';
import { Gitlab } from '@gitbeaker/browser';
import { Buffer } from "buffer";
// import { request } from 'graphql-request';


async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const limiter = new Bottleneck({
  maxConcurrent: 10, // Adjust based on the rate limit (300 calls per minute)
  minTime: 200, // Wait at least 200ms between each request
});

async function fetchAllPages(url: string, accessToken: string) {
  let results = [];
  let page = 1;
  let hasMorePages = true;

  while (hasMorePages) {
    const fetchData = async (url: string, page: number) => {
      const response = await fetch(`${url}&page=${page}`, {
        headers: {
          'PRIVATE-TOKEN': `${accessToken}`,
        },
      });
      const data = await response.json();
      return data;
    };

    // Schedule the request with limiter
    const data = await limiter.schedule(() => fetchData(url, page));

    if (data && data.length > 0) {
      results.push(...data);
      page++;
    } else {
      hasMorePages = false;
    }
  }

  return results;
}

// a function used to fetch data from gitlab and cache it
// makee an exported function that takes in the groupId, and returns a promise that resolves to the data
export async function getIssuesAndEpicsRest(apiUrl: string, groupId: number, accessToken: string): Promise<any> {
  
  let url = `${apiUrl}/api/v4/groups/${groupId}`;

  try {
    const projectResponse = await fetch(url, {
      headers: {
        'PRIVATE-TOKEN': `${accessToken}`,
      },
    });
    
    const res = await projectResponse.json()
    await sleep(500)
    const projects = res['projects']

    let groupIssues = [];
    for (const project of projects) {
      let issuesUrl = project['_links']['issues'] + "?per_page=100";
      let projectIssues = await fetchAllPages(issuesUrl, accessToken);

      // push the issues to the groupIssues array
      groupIssues.push(...projectIssues);
    }

    let epicResponseUrl = `${apiUrl}/api/v4/groups/${groupId}/epics?per_page=100`;
    let groupEpics = await fetchAllPages(epicResponseUrl, accessToken);
    
    let processedData = processGitlabData(groupIssues, groupEpics);
    let { issueFieldValuesDictionary, epicFieldValuesDictionary, issues, epics } = await processedData;
    return { issues, epics, issueFieldValuesDictionary, epicFieldValuesDictionary };
  } catch (error) {
    alert(error);
    throw new Error('Failed to fetch issues and epics from Gitlab API');
  }
}

const fetchPage = async (apiUrl: string, groupName: string, accessToken: string, issuesCursor = null, epicsCursor = null) => {
  const query = `
  query($issuesCursor: String, $epicsCursor: String) {
    group(fullPath: "${groupName}") {
      issues(after: $issuesCursor, first: 100) {
        pageInfo {
          endCursor
          hasNextPage
        }
        nodes {
          id
          title
          state
          createdAt
          timeEstimate
          iteration {
            id
            iid
            title
            startDate
            dueDate
          }
          author {
            name
          }
          updatedBy {
            name
          }
          updatedAt
          closedAt
          dueDate
          description
          labels {
            count
            nodes {
              title
            }
          }
          assignees {
            count
            nodes {
              emails {
                nodes {
                  email
                }
              }
            }
          }
          epic {
            id
            title
            state
            createdAt
            updatedAt
            closedAt
            startDate
            dueDate
            description
            labels {
              nodes {
                id
              }
            }
          }
        }
      }
      epics(after: $epicsCursor, first: 100) {
        pageInfo {
          endCursor
          hasNextPage
        }
        nodes {
          id
          title
          state
          createdAt
          updatedAt
          closedAt
          startDate
          dueDate
          description
          labels {
            nodes {
              id
            }
          }
        }
      }
    }
  }
  `
  const proxyUrl = 'http://localhost:8080/graphql-proxy'; // URL of your proxy server

  const response: any = await fetch(proxyUrl, {
    headers: {
      "x-api-url": `${apiUrl}/api/graphql`,
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Authorization": `Bearer ${accessToken}`,
    },
    method: "POST",
    body: JSON.stringify({
      query,
      variables: {
        issuesCursor,
        epicsCursor
      }
    }),
  });
  if (!response.ok) {
    throw new Error(`Network response was not ok, status: ${response.status}`);
  }

  return response.json();
}

export async function getIssuesAndEpicsGraphql(apiUrl: string, groupName: string, accessToken: string) {

  let epicFieldValuesDictionary: Record<string, ValueTypes[]> = {};
  type ValueTypes = string | number | boolean | Date | string[]; // Add here any other type that might appear in your obj.
  let issueFieldValuesDictionary: Record<string, ValueTypes[]> = {};
  let issues: any[] = [];
  let epics: any[] = [];
  let gitlabIssues: any[] = [];
  let gitlabEpics: any[] = [];
  let issuesCursor: any = null;
  let epicsCursor: any = null;
  let issuesPageInfo, epicsPageInfo;

  try {

    do {
      const { data } = await fetchPage(apiUrl, groupName, accessToken, issuesCursor, epicsCursor);
      const group = data.group;

      // Append new issues and epics directly to the arrays
      gitlabIssues.push(...group.issues.nodes);
      gitlabEpics.push(...group.epics.nodes);
      console.log(gitlabIssues.length)

      issuesPageInfo = group.issues.pageInfo;
      epicsPageInfo = group.epics.pageInfo;

      issuesCursor = issuesPageInfo.hasNextPage ? issuesPageInfo.endCursor : null;
      epicsCursor = epicsPageInfo.hasNextPage ? epicsPageInfo.endCursor : null;
    } while (issuesPageInfo.hasNextPage || epicsPageInfo.hasNextPage);

    for (const issue of gitlabIssues) {
      let issueLabels = issue.labels.nodes.map((label: any) => label.title) || [];
      let issueLabelsCount: number = issue.labels.count
      let issueAssigneesCount: number = issue.assignees.count
      let issueAssignees: string[] = issueAssigneesCount > 0 ? issue.assignees.nodes.map((assignee: any) => assignee.email) : [];

      if (issueAssigneesCount === 0) {
        issue.assignee = { username: "unassigned" }
      }

      if (!issue.closed_by) {
        issue.closed_by = { username: "" }
      }

      if (!issue.epic) {
        issue.epic = { id: 0, title: null, url: null, human_readable_end_date: null }
      }
      if (issueLabelsCount === 0) {
        issue.labels = []
      }

      let labels = issueLabels
      let workflow_issue_type;
      let workflow_state;
      let story_ci;

      const issueTypeMatch = labels.some((string: string) => /IssueType/.test(string));
      const workflowMatch = labels.some((string: string) => /Workflow/.test(string));

      const ciMatch = labels.some((string: string) => /CI::[A-Za-z0-9\s]+::[A-Za-z0-9\s]+/.test(string));

      if (ciMatch === true) {
        story_ci = labels.filter((label: string) => label.match(/CI::[A-Za-z0-9\s]+::[A-Za-z0-9\s]+/))[0]
        story_ci = story_ci.match(/CI::[A-Za-z0-9\s]+::(.*)/)[1]
      } else if (ciMatch === false) {
        story_ci = 'Unassigned CI'
      }

      if (issueTypeMatch === false) {
        workflow_issue_type = 'Unassigned IssueType';
      } else if (issueTypeMatch === true) {
        workflow_issue_type = labels.filter((label: string) => label.match(/IssueType::[A-Za-z0-9\s]+/))[0]
        workflow_issue_type = workflow_issue_type.match(/IssueType::(.*)$/)[1]
      }

      if (workflowMatch === false) {
        workflow_state = 'Unassigned State';
      } else if (workflowMatch === true) {
        workflow_state = labels.filter((label: string) => label.match(/Workflow::[A-Za-z0-9\s]+/))[0]
        workflow_state = workflow_state.match(/Workflow::(.*)$/)[1]
      }

      let story_ci_type;

      const issueTypeMatchT = labels.some((string: string) => /IssueType/.test(string));
      const workflowMatchT = labels.some((string: string) => /Workflow/.test(string));

      const ciMatchT = labels.some((string: string) => /CI::[A-Za-z0-9\s-]+::[A-Za-z0-9\s-]+/.test(string));

      if (ciMatchT) {
        story_ci_type = labels
          .filter((label: string) => label.match(/CI::([A-Za-z0-9\s-]+)::[A-Za-z0-9\s-]+/))[0]
          .match(/CI::([A-Za-z0-9\s-]+)::/)[1];
      } else {
        story_ci_type = 'Unassigned CI';
      }

      if (!issueTypeMatchT) {
        workflow_issue_type = 'Unassigned IssueType';
      } else {
        workflow_issue_type = labels
          .filter((label: string) => label.match(/IssueType::([A-Za-z0-9\s-]+)/))[0]
          .match(/IssueType::([A-Za-z0-9\s-]+)/)[1];
      }

      if (!workflowMatchT) {
        workflow_state = 'Unassigned State';
      } else {
        workflow_state = labels
          .filter((label: string) => label.match(/Workflow::([A-Za-z0-9\s-]+)/))[0]
          .match(/Workflow::([A-Za-z0-9\s-]+)/)[1];
      }

      let weight = issue.weight ? issue.weight : ""
      let created_at = issue.created_at
      let createdDateData = getDateInfo(new Date(created_at))
      let created_month = createdDateData.monthName
      let created_month_number = String(createdDateData.monthNumber) || ""
      let created_year = String(createdDateData.year) || ""
      let updated_at = issue.updated_at || ""
      let updatedDateData = getDateInfo(new Date(updated_at))
      let updated_month = updatedDateData.monthName
      let updated_month_number = String(updatedDateData.monthNumber) || ""
      let updated_year = String(updatedDateData.year) || ""
      let closed_at = issue.closed_at ? issue.closed_at : ""
      let closedDateData = getDateInfo(new Date(closed_at))
      let closed_month = issue.closed_at ? closedDateData.monthName : ""
      let closed_month_number = issue.closed_at ? String(closedDateData.monthNumber) : ""
      let closed_year = issue.closed_at ? String(closedDateData.year) : ""
      let due_date = issue.due_date ? issue.due_date.split("T")[0] : ""
      let dueDateData = getDateInfo(new Date(due_date))
      let due_date_threshold = dueDateData.dateThreshold
      let epic_due_date = issue.epic.human_readable_end_date ? issue.epic.human_readable_end_date.split("T")[0] : ""
      let epic_id = issue.epic.iid ? issue.epic.iid : ""
      let epic_title = issue.epic.title ? issue.epic.title : "No Epic Assigned"
      let epic_url = issue.epic.url ? issue.epic.url : ""
      let ticket_age = !closed_at ? getDiffInDays(new Date(created_at), new Date()) : getDiffInDays(new Date(created_at), new Date(closed_at))
      let updated_days = getDiffInDays(new Date(updated_at), new Date())
      let daysLeftInSprint = 0;
      let assignee_stage = issueAssigneesCount > 0 ? issueAssignees[0] : ""
      let assignee = formatName(assignee_stage)
      let assignees = issueAssignees
      let closed_by_stage = issue.closed_by.name ? issue.closed_by.name : ""
      let closed_by = formatName(closed_by_stage)
      let milestone = issue.milestone ? issue.milestone.title : ""
      let iteration_start_date = issue.hasOwnProperty('iteration') && issue.iteration !== null ? issue.iteration.start_date : ""
      let iteration_due_date = issue.hasOwnProperty('iteration') && issue.iteration !== null ? issue.iteration.due_date : ""
      let iteration_name = issue.hasOwnProperty('iteration') && issue.iteration !== null ? `${iteration_start_date} - ${iteration_due_date}` : ""
      let sprintStartDate: Date | null = null;
      let sprintEndDate: Date | null = null;
      let description = issue.description ? issue.description : ""
      let author_stage = issue.author.name ? issue.author.name : ""
      let author = formatName(author_stage)
      let id = issue.iid ? issue.iid : ""
      let title = issue.title ? issue.title : ""
      let issue_state = issue.state ? issue.state : ""
      let project_id = issue.project_id ? issue.project_id : ""
      let time_estimate = issue['timeEstimate']
      let total_time_spent = issue['totalTimeSpent']
      let type = "issue"
      let Value = 1

      // Regular expression to match "Start Date - End Date" pattern
      const regex = /(\d{1,2})\.(\d{1,2}) - (\d{1,2})\.(\d{1,2})/;
      const matches = milestone.match(regex);

      if (matches && matches.length === 5) {
        const startDateMonth = parseInt(matches[1], 10);
        const startDateDay = parseInt(matches[2], 10);
        const endDateMonth = parseInt(matches[3], 10);
        const endDateDay = parseInt(matches[4], 10);

        // Calculate the start and end dates
        sprintStartDate = new Date(new Date().getFullYear(), startDateMonth - 1, startDateDay);
        sprintEndDate = new Date(new Date().getFullYear(), endDateMonth - 1, endDateDay);

        // Calculate the days left in the sprint
        const currentDate = new Date();
        if (currentDate < sprintEndDate) {
          const timeDiff = sprintEndDate.getTime() - currentDate.getTime();
          daysLeftInSprint = Math.ceil(timeDiff / (1000 * 3600 * 24)); // Convert milliseconds to days
        }
      }

      let issueObj: IssueObjectType = {
        Time: issue.created_at,
        id: id,
        title: title,
        state: issue_state,
        story_ci: story_ci,
        story_ci_type: story_ci_type,
        workflow_state: workflow_state,
        workflow_issue_type: workflow_issue_type,
        project_id: project_id,
        assignee: assignee,
        assignees: assignees,
        closed_by: closed_by,
        milestone: milestone,
        iteration_start_date: iteration_start_date,
        iteration_due_date: iteration_due_date,
        iteration_name: iteration_name,
        sprintStartDate: sprintStartDate,
        sprintEndDate: sprintEndDate,
        description: description,
        time_estimate: time_estimate,
        total_time_spent: total_time_spent,
        author: author,
        type: type,
        Value: Value,
        ticket_age: ticket_age,
        updated_days: updated_days,
        daysLeftInSprint: daysLeftInSprint,
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
        due_date_threshold: due_date_threshold,
        parent_channel: "",
        c3score: 0,
        weight: weight,
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

    for (let epic of gitlabEpics) {

      let epicLabels = epic.labels.nodes.map((label: any) => label.title) || [];

      // find all the child issues of an epic, and create an array from the assignees
      let epic_labels = epicLabels
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
        case epic_labels.includes('Epic Stage::Blocked'):
          epic_state = 'Blocked';
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

      //O&I Metrics
      let labels = epicLabels
      let epic_category;
      let epic_priority;
      let epic_pillar;

      const categoryMatchT = labels.some((string: string) => /Category/.test(string));
      const priorityMatchT = labels.some((string: string) => /Priority/.test(string));
      const pillarMatchT = labels.some((string: string) => /Pillar/.test(string));

      if (!categoryMatchT) {
        epic_category = 'Unassigned Category';
      } else {
        epic_category = labels
          .filter((label: string) => label.match(/Category::([A-Za-z0-9\s-]+)/))[0]
          .match(/Category::([A-Za-z0-9\s-]+)/)[1];
      }

      if (!priorityMatchT) {
        epic_priority = 'Not Prioritized';
      } else {
        epic_priority = labels
          .filter((label: string) => label.match(/Priority::([A-Za-z0-9\s-]+)/))[0]
          .match(/Priority::([A-Za-z0-9\s-]+)/)[1];
      }

      if (!pillarMatchT) {
        epic_pillar = 'No Pillar';
      } else {
        epic_pillar = labels
          .filter((label: string) => label.match(/Pillar::([A-Za-z0-9\s-]+)/))[0]
          .match(/Pillar::([A-Za-z0-9\s-]+)/)[1];
      }

      let created_at = epic.created_at
      let createdDateData = getDateInfo(new Date(created_at))
      let created_month = createdDateData.monthName
      let created_month_number = String(createdDateData.monthNumber) || ""
      let created_year = String(createdDateData.year) || ""
      let updated_at = epic.updated_at || ""
      let updatedDateData = getDateInfo(new Date(updated_at))
      let updated_month = updatedDateData.monthName
      let updated_month_number = String(updatedDateData.monthNumber) || ""
      let updated_year = String(updatedDateData.year) || ""
      let closed_at = epic.closed_at ? epic.closed_at : ""
      let closedDateData = getDateInfo(new Date(closed_at))
      let closed_month = epic.closed_at ? closedDateData.monthName : ""
      let closed_month_number = epic.closed_at ? String(closedDateData.monthNumber) : ""
      let closed_year = epic.closed_at ? String(closedDateData.year) : ""
      let due_date = epic.due_date ? epic.due_date.split("T")[0] : ""
      let dueDateData = getDateInfo(new Date(due_date))
      let due_date_threshold = dueDateData.dateThreshold
      let due_date_month = due_date ? dueDateData.monthName : "TBD"
      let due_date_month_number = String(dueDateData.monthNumber) || ""
      let due_date_year = String(dueDateData.year) || ""
      let start_date = epic.start_date ? epic.start_date.split("T")[0] : ""
      let start_month_data = getDateInfo(new Date(start_date))
      let start_month = start_date ? start_month_data.monthName : "TBD"
      let end_date = epic.end_date ? epic.end_date.split("T")[0] : ""
      let group_id = epic.group_id ? epic.group_id : ""
      let id = epic.iid ? epic.iid : ""
      let title = epic.title ? epic.title : ""

      // Original code
      let findChildIssues = issues.filter((issue) => issue.epic_title === String(title)) || [];
      let epic_assignees = findChildIssues.map((issue) => issue.assignees).flat(1) || [];
      let most_common_epic_assignee_filter = findMostCommonElement(epic_assignees);
      most_common_epic_assignee_filter = formatName(most_common_epic_assignee_filter);

      // find which assignees show up in the epic_assignees the most
      // Ensure that the assignees array is unique
      epic_assignees = [...new Set(epic_assignees)];

      // Calculate the number of assignees
      let numAssignees = epic_assignees.length;

      // Format the assignee names
      let formattedEpicAssignees = epic_assignees.map((assignee: string) => formatName(assignee));
      let strEpicAssignees = formattedEpicAssignees.join(", ");

      // Calculate the number of open, closed, and total issues
      let openissues = findChildIssues.filter((issue) => issue.state === "opened").length;
      let closedissues = findChildIssues.filter((issue) => issue.state === "closed").length;
      let totalIssues = findChildIssues.length;

      // Calculate the percentage completion for the entire epic (as a number)
      let pctcomplete = (closedissues / totalIssues) * 100;

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
        start_month: start_month,
        end_date: end_date,
        due_date: due_date,
        due_date_threshold: due_date_threshold,
        due_date_month: due_date_month,
        due_date_month_number: due_date_month_number,
        due_date_year: due_date_year,
        description: epic.description,
        epic_c3: epic_c3,
        epic_channel: epic_channel,
        epic_rank: epic_rank,
        epic_assignees: strEpicAssignees,
        most_common_epic_assignee_filter: most_common_epic_assignee_filter,
        openissues: openissues,
        closedissues: closedissues,
        totalissues: totalIssues,
        pctcomplete: pctcomplete,
        numAssignees: numAssignees,
        //O&I Metrics
        epic_category: epic_category,
        epic_priority: epic_priority,
        epic_pillar: epic_pillar,
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
      });
    }

    // for issues, find the parent epic and its labels
    for (let issue of issues) {
      let parentEpic = epics.find((epic) => epic.title === String(issue.epic_title));
      if (parentEpic) {
        issue['parent_channel'] = parentEpic['epic_channel']

        switch (true) {
          case parentEpic['epic_channel'] === 'Enterprise Project':
            issue['c3score'] = 6;
            break;
          case parentEpic['epic_channel'] === 'Internal CF Project':
            issue['c3score'] = 3;
            break;
          case parentEpic['epic_channel'] === 'Non-Project Related':
            issue['c3score'] = 1;
            break;
          default:
            issue['c3score'] = 0;
        }
      }
    }

    console.log(JSON.stringify(issues))

    return { issues, epics, issueFieldValuesDictionary, epicFieldValuesDictionary };
  } catch (error) {
    alert(error);
    throw new Error('Failed to fetch issues and epics from GitLab GraphQL API');
  }
}

export async function getIssuesAndEpicsGitbreakerClient(apiUrl: string, groupId: number, accessToken: string): Promise<any> {

  try {
    const api = new Gitlab({
      token: accessToken,
      host: apiUrl
    });

    type ValueTypes = string | number | boolean | Date | string[]; // Add here any other type that might appear in your obj.

    let epics: EpicObjectType[] = [];
    let epicFieldValuesDictionary: Record<string, ValueTypes[]> = {};

    let issues: IssueObjectType[] = [];

    let issueFieldValuesDictionary: Record<string, ValueTypes[]> = {};

    const [...groupEpics] = await api.Epics.all(groupId)
    const [...projectIssues] = await api.Issues.all({ groupId });

    for (const issue of projectIssues) {

      let labels: any = issue.labels
      let workflow_issue_type: any;
      let workflow_state: any;
      let story_ci: any;
      let story_ci_type: any;

      const issueTypeMatch = labels.some((string: string) => /IssueType/.test(string));
      const workflowMatch = labels.some((string: string) => /Workflow/.test(string));

      const ciMatch = labels.some((string: string) => /CI::[A-Za-z0-9\s]+::[A-Za-z0-9\s]+/.test(string));

      if (ciMatch === true) {
        story_ci = labels.filter((label: string) => label.match(/CI::[A-Za-z0-9\s]+::[A-Za-z0-9\s]+/))[0]
        story_ci = story_ci.match(/CI::[A-Za-z0-9\s]+::(.*)/)[1]
      } else if (ciMatch === false) {
        story_ci = 'Unassigned CI'
      }

      if (issueTypeMatch === false) {
        workflow_issue_type = 'Unassigned IssueType';
      } else if (issueTypeMatch === true) {
        workflow_issue_type = labels.filter((label: string) => label.match(/IssueType::[A-Za-z0-9\s]+/))[0]
        workflow_issue_type = workflow_issue_type.match(/IssueType::(.*)$/)[1]
      }

      if (workflowMatch === false) {
        workflow_state = 'Unassigned State';
      } else if (workflowMatch === true) {
        workflow_state = labels.filter((label: string) => label.match(/Workflow::[A-Za-z0-9\s]+/))[0]
        workflow_state = workflow_state.match(/Workflow::(.*)$/)[1]
      }

      const issueTypeMatchT = labels.some((string: string) => /IssueType/.test(string));
      const workflowMatchT = labels.some((string: string) => /Workflow/.test(string));

      const ciMatchT = labels.some((string: string) => /CI::[A-Za-z0-9\s-]+::[A-Za-z0-9\s-]+/.test(string));

      if (ciMatchT) {
        story_ci_type = labels
          .filter((label: string) => label.match(/CI::([A-Za-z0-9\s-]+)::[A-Za-z0-9\s-]+/))[0]
          .match(/CI::([A-Za-z0-9\s-]+)::/)[1];
      } else {
        story_ci_type = 'Unassigned CI';
      }

      if (!issueTypeMatchT) {
        workflow_issue_type = 'Unassigned IssueType';
      } else {
        workflow_issue_type = labels
          .filter((label: string) => label.match(/IssueType::([A-Za-z0-9\s-]+)/))[0]
          .match(/IssueType::([A-Za-z0-9\s-]+)/)[1];
      }

      if (!workflowMatchT) {
        workflow_state = 'Unassigned State';
      } else {
        workflow_state = labels
          .filter((label: string) => label.match(/Workflow::([A-Za-z0-9\s-]+)/))[0]
          .match(/Workflow::([A-Za-z0-9\s-]+)/)[1];
      }

      let epic: any = issue.epic || { id: 0, title: null, url: null, human_readable_end_date: null }
      let issueAssignee: any = issue.assignee || { username: "unassigned" }
      let iteration: any = issue.iteration || { start_date: null, due_date: null }
      let closed_by: any = issue.closed_by || { name: "" }
      let issueAuthor: any = issue.author || { name: "" }
      let issueMilestone: any = issue.milestone || { title: "" }
      let issueTimeEstimate: any = issue.time_stats || { time_estimate: null, total_time_spent: null }

      let weight = issue.weight ? issue.weight : ""
      let created_at: any = issue.created_at
      let due_date: any = issue.due_date
      let createdDateData = getDateInfo(new Date(created_at))
      let created_month = createdDateData.monthName
      let created_month_number = String(createdDateData.monthNumber) || ""
      let created_year = String(createdDateData.year) || ""
      let updated_at: any = issue.updated_at || ""
      let updatedDateData = getDateInfo(new Date(updated_at))
      let updated_month = updatedDateData.monthName
      let updated_month_number = String(updatedDateData.monthNumber) || ""
      let updated_year = String(updatedDateData.year) || ""
      let closed_at: any = issue.closed_at ? issue.closed_at : ""
      let closedDateData = getDateInfo(new Date(closed_at))
      let closed_month = issue.closed_at ? closedDateData.monthName : ""
      let closed_month_number = issue.closed_at ? String(closedDateData.monthNumber) : ""
      let closed_year = issue.closed_at ? String(closedDateData.year) : ""
      due_date = due_date ? due_date.split("T")[0] : ""
      let dueDateData = getDateInfo(new Date(due_date))
      let due_date_threshold = dueDateData.dateThreshold
      let epic_due_date = epic ? epic.human_readable_end_date : ""
      let epic_id = epic.iid ? epic.iid : ""
      let epic_title = epic.title ? epic.title : "No Epic Assigned"
      let epic_url = epic.url ? epic.url : ""
      let ticket_age = !closed_at ? getDiffInDays(new Date(created_at), new Date()) : getDiffInDays(new Date(created_at), new Date(closed_at))
      let updated_days = getDiffInDays(new Date(updated_at), new Date())
      let daysLeftInSprint = 0;
      let assignee_stage = issueAssignee['username']
      let assignee = formatName(assignee_stage)
      let assignees = Array.isArray(issue.assignees) ? issue.assignees.map((assignee: any) => assignee.name) : [];
      let closed_by_stage = closed_by.name ? closed_by.name : ""
      closed_by = formatName(closed_by_stage)
      let milestone = issueMilestone
      let iteration_start_date = issue.hasOwnProperty('iteration') ? iteration.start_date : ""
      let iteration_due_date = issue.hasOwnProperty('iteration') ? iteration.due_date : ""
      let iteration_name = issue.hasOwnProperty('iteration') && issue.iteration !== null ? `${iteration_start_date} - ${iteration_due_date}` : ""
      let sprintStartDate: Date | null = null;
      let sprintEndDate: Date | null = null;
      let description: any = issue.description
      let author_stage = issueAuthor.name
      let author = formatName(author_stage)
      let id = issue.iid ? issue.iid : ""
      let title: any = issue.title
      let issue_state: any = issue.state
      let project_id = issue.project_id ? issue.project_id : ""
      let time_estimate = issueTimeEstimate['time_estimate']
      let total_time_spent = issueTimeEstimate['total_time_spent']
      let type = "issue"
      let Value = 1

      // Regular expression to match "Start Date - End Date" pattern
      const regex = /(\d{1,2})\.(\d{1,2}) - (\d{1,2})\.(\d{1,2})/;
      const matches = milestone.match(regex);

      if (matches && matches.length === 5) {
        const startDateMonth = parseInt(matches[1], 10);
        const startDateDay = parseInt(matches[2], 10);
        const endDateMonth = parseInt(matches[3], 10);
        const endDateDay = parseInt(matches[4], 10);

        // Calculate the start and end dates
        sprintStartDate = new Date(new Date().getFullYear(), startDateMonth - 1, startDateDay);
        sprintEndDate = new Date(new Date().getFullYear(), endDateMonth - 1, endDateDay);

        // Calculate the days left in the sprint
        const currentDate = new Date();
        if (currentDate < sprintEndDate) {
          const timeDiff = sprintEndDate.getTime() - currentDate.getTime();
          daysLeftInSprint = Math.ceil(timeDiff / (1000 * 3600 * 24)); // Convert milliseconds to days
        }
      }
      let issueObj: IssueObjectType = {
        Time: new Date(created_at),
        id: id.toString(),
        title: title,
        state: issue_state,
        story_ci: story_ci,
        story_ci_type: story_ci_type,
        workflow_state: workflow_state,
        workflow_issue_type: workflow_issue_type,
        project_id: project_id.toString(),
        assignee: assignee,
        assignees: assignees,
        closed_by: closed_by,
        milestone: milestone,
        iteration_start_date: iteration_start_date,
        iteration_due_date: iteration_due_date,
        iteration_name: iteration_name,
        sprintStartDate: sprintStartDate,
        sprintEndDate: sprintEndDate,
        description: description,
        time_estimate: time_estimate.toString(),
        total_time_spent: total_time_spent.toString(),
        author: author,
        type: type,
        Value: Value,
        ticket_age: ticket_age,
        updated_days: updated_days,
        daysLeftInSprint: daysLeftInSprint,
        updated_at: new Date(updated_at),
        updated_month: updated_month,
        updated_month_number: updated_month_number,
        updated_year: updated_year,
        closed_at: new Date(closed_at),
        closed_month: closed_month,
        closed_month_number: closed_month_number,
        closed_year: closed_year,
        created_at: new Date(created_at),
        created_month: created_month,
        created_month_number: created_month_number,
        created_year: created_year,
        due_date: new Date(due_date),
        due_date_threshold: due_date_threshold,
        parent_channel: "",
        c3score: 0,
        weight: weight,
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

    for (const epic of groupEpics) {


      // find all the child issues of an epic, and create an array from the assignees
      let epic_labels: any = epic.labels
      let epic_state: any;
      let epic_c3: any;
      let epic_channel: any;
      let epic_rank: any;

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
        case epic_labels.includes('Epic Stage::Blocked'):
          epic_state = 'Blocked';
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

      //O&I Metrics
      let labels: any = epic.labels
      let epic_category: any;
      let epic_priority: any;
      let epic_pillar: any;

      const categoryMatchT = labels.some((string: string) => /Category/.test(string));
      const priorityMatchT = labels.some((string: string) => /Priority/.test(string));
      const pillarMatchT = labels.some((string: string) => /Pillar/.test(string));

      if (!categoryMatchT) {
        epic_category = 'Unassigned Category';
      } else {
        epic_category = labels
          .filter((label: string) => label.match(/Category::([A-Za-z0-9\s-]+)/))[0]
          .match(/Category::([A-Za-z0-9\s-]+)/)[1];
      }

      if (!priorityMatchT) {
        epic_priority = 'Not Prioritized';
      } else {
        epic_priority = labels
          .filter((label: string) => label.match(/Priority::([A-Za-z0-9\s-]+)/))[0]
          .match(/Priority::([A-Za-z0-9\s-]+)/)[1];
      }

      if (!pillarMatchT) {
        epic_pillar = 'No Pillar';
      } else {
        epic_pillar = labels
          .filter((label: string) => label.match(/Pillar::([A-Za-z0-9\s-]+)/))[0]
          .match(/Pillar::([A-Za-z0-9\s-]+)/)[1];
      }

      let created_at = epic.created_at
      let end_date: any = epic.human_readable_end_date
      let createdDateData = getDateInfo(new Date(created_at))
      let created_month = createdDateData.monthName
      let created_month_number = String(createdDateData.monthNumber) || ""
      let created_year = String(createdDateData.year) || ""
      let updated_at = epic.updated_at || ""
      let updatedDateData = getDateInfo(new Date(updated_at))
      let updated_month = updatedDateData.monthName
      let updated_month_number = String(updatedDateData.monthNumber) || ""
      let updated_year = String(updatedDateData.year) || ""
      let closed_at = epic.closed_at ? epic.closed_at : ""
      let closedDateData = getDateInfo(new Date(closed_at))
      let closed_month = epic.closed_at ? closedDateData.monthName : ""
      let closed_month_number = epic.closed_at ? String(closedDateData.monthNumber) : ""
      let closed_year = epic.closed_at ? String(closedDateData.year) : ""
      let due_date = epic.due_date ? epic.due_date.split("T")[0] : ""
      let dueDateData = getDateInfo(new Date(due_date))
      let due_date_threshold = dueDateData.dateThreshold
      let due_date_month = due_date ? dueDateData.monthName : "TBD"
      let due_date_month_number = String(dueDateData.monthNumber) || ""
      let due_date_year = String(dueDateData.year) || ""
      let start_date = epic.start_date ? epic.start_date.split("T")[0] : ""
      let start_month_data = getDateInfo(new Date(start_date))
      let start_month = start_date ? start_month_data.monthName : "TBD"
      end_date = end_date.split("T")[0]
      let group_id = epic.group_id ? epic.group_id : ""
      let id = epic.iid ? epic.iid : ""
      let title = epic.title ? epic.title : ""

      // Original code
      let findChildIssues = issues.filter((issue) => issue.epic_title === String(title)) || [];
      let epic_assignees = findChildIssues.map((issue) => issue.assignees).flat(1) || [];
      let most_common_epic_assignee_filter = findMostCommonElement(epic_assignees);
      most_common_epic_assignee_filter = formatName(most_common_epic_assignee_filter);

      // find which assignees show up in the epic_assignees the most
      // Ensure that the assignees array is unique
      epic_assignees = [...new Set(epic_assignees)];

      // Calculate the number of assignees
      let numAssignees = epic_assignees.length;

      // Format the assignee names
      let formattedEpicAssignees = epic_assignees.map((assignee: string) => formatName(assignee));
      let strEpicAssignees = formattedEpicAssignees.join(", ");

      // Calculate the number of open, closed, and total issues
      let openissues = findChildIssues.filter((issue) => issue.state === "opened").length;
      let closedissues = findChildIssues.filter((issue) => issue.state === "closed").length;
      let totalIssues = findChildIssues.length;

      // Calculate the percentage completion for the entire epic (as a number)
      let pctcomplete = (closedissues / totalIssues) * 100;

      let epicObj: EpicObjectType = {
        Time: new Date(created_at),
        id: id.toString(),
        title: title,
        state: epic.state,
        epic_state: epic_state,
        type: "epic",
        group_id: group_id.toString(),
        created_at: new Date(created_at),
        created_month: created_month,
        created_month_number: created_month_number,
        created_year: created_year,
        updated_at: new Date(updated_at),
        updated_month: updated_month,
        updated_month_number: updated_month_number,
        updated_year: updated_year,
        closed_at: new Date(closed_at),
        closed_month: closed_month,
        closed_month_number: closed_month_number,
        closed_year: closed_year,
        closed_by: epic.closed_by,
        start_date: new Date(start_date),
        start_month: start_month,
        end_date: end_date,
        due_date: new Date(due_date),
        due_date_threshold: due_date_threshold,
        due_date_month: due_date_month,
        due_date_month_number: due_date_month_number,
        due_date_year: due_date_year,
        description: epic.description,
        epic_c3: epic_c3,
        epic_channel: epic_channel,
        epic_rank: epic_rank,
        epic_assignees: strEpicAssignees,
        most_common_epic_assignee_filter: most_common_epic_assignee_filter,
        openissues: openissues,
        closedissues: closedissues,
        totalissues: totalIssues,
        pctcomplete: pctcomplete,
        numAssignees: numAssignees,
        //O&I Metrics
        epic_category: epic_category,
        epic_priority: epic_priority,
        epic_pillar: epic_pillar,
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

    // for issues, find the parent epic and its labels
    for (const issue of issues) {
      let parentEpic = epics.find((epic) => epic.title === String(issue.epic_title));
      if (parentEpic) {
        issue['parent_channel'] = parentEpic['epic_channel']

        switch (true) {
          case parentEpic['epic_channel'] === 'Enterprise Project':
            issue['c3score'] = 6;
            break;
          case parentEpic['epic_channel'] === 'Internal CF Project':
            issue['c3score'] = 3;
            break;
          case parentEpic['epic_channel'] === 'Non-Project Related':
            issue['c3score'] = 1;
            break;
          default:
            issue['c3score'] = 0;
        }
      }
    }
    return { issues, epics, issueFieldValuesDictionary, epicFieldValuesDictionary };
  } catch (error) {
    alert(error);
    throw new Error('Failed to fetch issues and epics from GitLab GraphQL API');
  }
}

export async function getIssuesAndEpicsExpress(apiUrl: string, groupId: number): Promise<any> {

  try {
    console.log(`proxying request to gitlab through ${apiUrl}/gitlab?group=${groupId}`)
    const response = await fetch(`${apiUrl}/gitlab?group=${groupId}`);
    // buffer and base64 decode the response body
    let data = await response.json();
    const decodedBody: any = await JSON.parse(Buffer.from(data['data'], 'base64').toString('utf8'))

    const processedData =  await processGitlabData(decodedBody['issues'], decodedBody['epics']);
    // parse the response body as JSON
    const { issueFieldValuesDictionary, epicFieldValuesDictionary, issues, epics } =await processedData;
    return { issues: issues || [], epics: epics || [], issueFieldValuesDictionary: issueFieldValuesDictionary || {}, epicFieldValuesDictionary: epicFieldValuesDictionary || {} };
  } catch (error) {
    alert(error);
    throw new Error('Failed to fetch issues and epics from Express API');
  }
}
