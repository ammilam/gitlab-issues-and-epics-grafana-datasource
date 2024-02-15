const { Gitlab } = require('@gitbeaker/rest');
const fs = require('fs');
const cron = require('node-cron');

const gitlabToken = process.env.token || process.env.GIT_ASKPASS // Access token for GitLab API
const gitlabHost = process.env.host// GitLab host
const groups = [process.env.groups] || [] // GitLab group IDs
const cronSchedule = process.env.cronSchedule || '*/5 * * * *' // cron schedule

const responseMap = {
  "groups": "No groups to process",
  "token": "No token",
  "host": "No host",
}

const api = new Gitlab({
  token: gitlabToken,
  host: gitlabHost,
});

async function writeFile(groups) {

  try {

    if (groups.length > 0 && gitlabToken && gitlabHost) {

      const now = new Date();

      console.log(`Starting data collection at ${now}`);

      for (let i = 0; i < groups.length; i++) {

        const group = groups[i];

        console.log(`Getting issues for group ${group}`)

        const issues = await api.Issues.all({
          groupId: group,
        })

        console.log(`Getting epics for group ${group}`)

        const epics = await api.Epics.all(group)

        let issuesCount = issues.length
        let epicsCount = epics.length

        let obj = {
          issues, issuesCount, epicsCount, epics
        }

        // writing local dictionary file
        fs.writeFileSync(`./data/${group}.json`, JSON.stringify(obj));
      }
    } else {
      // log out what is missing from the environment variables
      for (const [key, value] of Object.entries(responseMap)) {
        if (!process.env[key]) {
          console.log(value)
        }
      }
    }
  } catch (error) {
    console.log("error writing to file" + error)
  }
}

function startCron() {
  cron.schedule(cronSchedule, () => {
    writeFile(groups);
  });
}

startCron()