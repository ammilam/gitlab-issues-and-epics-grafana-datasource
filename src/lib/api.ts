
import { processGitlabData } from './processing';
import Bottleneck from 'bottleneck';
import { Gitlab } from '@gitbeaker/browser';
import { Buffer } from "buffer";

// a sleep function to wait between requests
async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// create a limiter to limit the number of requests per minute
const limiter = new Bottleneck({
  maxConcurrent: 10, // Adjust based on the rate limit (300 calls per minute)
  minTime: 200, // Wait at least 200ms between each request
});

// a function to fetch all the pages of a paginated response
async function fetchAllPages(url: string, accessToken: string) {
  let results = []; // store all results in this array
  let page = 1; // start with page 1
  let hasMorePages = true; // assume there are more pages to fetch

  // while there are more pages to fetch
  while (hasMorePages) {
    // fetch the next page
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

    // if the response is not empty, push the data to the results array and increment the page number
    if (data && data.length > 0) {
      results.push(...data);
      page++;
    } else {
      // if the response is empty, there are no more pages to fetch
      hasMorePages = false;
    }
  }

  return results; // return the results
}

// a function used to fetch issues and epics from the Gitlab REST API
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
  const proxyUrl = 'http://localhost:3000/graphql-proxy'; // URL of your proxy server

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

// a function used to fetch issues and epics from the Gitlab GraphQL API
export async function getIssuesAndEpicsGraphql(apiUrl: string, groupName: string, accessToken: string) {

  try {

    let groupIssues: any[] = [];
    let groupEpics: any[] = [];
    let issuesCursor = null;
    let epicsCursor = null
    let issuesPageInfo, epicsPageInfo;


    do {
      const { data } = await fetchPage(apiUrl, groupName, accessToken, issuesCursor, epicsCursor)
      const group: any = data.group;

      // Append new issues and epics directly to the arrays
      groupIssues.push(...group.issues.nodes);
      groupEpics.push(...group.epics.nodes);

      issuesPageInfo = group.issues.pageInfo;
      epicsPageInfo = group.epics.pageInfo;

      issuesCursor = issuesPageInfo.hasNextPage ? issuesPageInfo.endCursor : null;
      epicsCursor = epicsPageInfo.hasNextPage ? epicsPageInfo.endCursor : null;
    } while (issuesPageInfo.hasNextPage || epicsPageInfo.hasNextPage);

    // process the issues and epics
    const processedData = processGitlabData(groupIssues, groupEpics);
    const { issueFieldValuesDictionary, epicFieldValuesDictionary, issues, epics } = await processedData;

    return { issues, epics, issueFieldValuesDictionary, epicFieldValuesDictionary };
  } catch (error) {
    alert(error);
    throw new Error('Failed to fetch issues and epics from GitLab GraphQL API');
  }
}

// a function used to fetch issues and epics from the Gitlab Gitbreaker Client Library
export async function getIssuesAndEpicsGitbreakerClient(apiUrl: string, groupId: number, accessToken: string): Promise<any> {

  try {
    const api = new Gitlab({
      token: accessToken,
      host: apiUrl
    });

    const groupEpics = await api.Epics.all(groupId)
    const groupIssues = await api.Issues.all({ groupId });

    const processedData = processGitlabData(groupIssues, groupEpics);
    const { issueFieldValuesDictionary, epicFieldValuesDictionary, issues, epics } = await processedData;

    return { issues, epics, issueFieldValuesDictionary, epicFieldValuesDictionary };
  } catch (error) {
    alert(error);
    throw new Error('Failed to fetch issues and epics from GitLab GraphQL API');
  }
}

// a function used to fetch issues and epics from a custom Expressjs API
/**
 * Fetches issues and epics from the Express API.
 * 
 * @param apiUrl - The URL of the Express API.
 * @param groupId - The ID of the group.
 * @returns A Promise that resolves to an object containing the fetched issues and epics.
 * @throws An error if the HTTP request fails or if there is an error processing the data.
 */
export async function getIssuesAndEpicsExpress(apiUrl: string, groupId: number): Promise<any> {

  try {
    console.log(`proxying request to gitlab through ${apiUrl}/gitlab?group=${groupId}`)

    /**
     * Options for making an API request.
     * @typedef {object} RequestOptions
     * @property {string} method - The HTTP method for the request.
     * @property {object} headers - The headers for the request.
     * @property {string} headers.Accept - The value of the 'Accept' header.
     * @property {string} headers.Content-Type - The value of the 'Content-Type' header.
     * @property {string} credentials - The credentials mode for the request.
     */

    const requestOptions: object = {
      mode: 'no-cors',
      credentials: false,
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      }
    }

    const response = await fetch(`${apiUrl}/gitlab?group=${groupId}`, requestOptions);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    const decodedData = JSON.parse(Buffer.from(data.data, 'base64').toString('utf8'));

    const processedData = await processGitlabData(decodedData.issues, decodedData.epics);
    ;
    // parse the response body as JSON
    const { issueFieldValuesDictionary, epicFieldValuesDictionary, issues, epics } = await processedData;
    return { issues: issues || [], epics: epics || [], issueFieldValuesDictionary: issueFieldValuesDictionary || {}, epicFieldValuesDictionary: epicFieldValuesDictionary || {} };
  } catch (error) {
    alert(error);
    throw new Error('Failed to fetch issues and epics from Express API ' + error);
  }
}
