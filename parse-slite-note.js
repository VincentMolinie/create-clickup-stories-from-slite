import 'dotenv/config';
import fetch from 'node-fetch';
import inquirer from 'inquirer';
const prompt = inquirer.createPromptModule();

if (!process.env.SLITE_API_SECRET_KEY) {
  throw new Error('Missing SLITE_API_SECRET_KEY env variable');
}
if (!process.env.CLICKUP_API_KEY) {
  throw new Error('Missing CLICKUP_API_KEY env variable');
}

const fibonaccis = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
const teamsToListId = {
  'Flow Team': 901510835271,
  'Agent Team': 152668835,
  'Platform Team': 186886568,
};

const customFieldsNameToIds = {
  linkToEpic: "1b171b20-5b87-4659-a1de-6a08ed101bdf",
  storyPoints: "7243d679-4c7f-4402-a4d5-b13de1ac3d1f",
}

async function getSliteNote(noteId) {
  const response = await fetch(
    `https://api.slite.com/v1/notes/${noteId}`,
    {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'x-slite-api-key': process.env.SLITE_API_SECRET_KEY,
      }
    }
  );
  return await response.json();
}

// async function getTags() {
//   const spaceId = '2453539';
//   const resp = await fetch(
//     `https://api.clickup.com/api/v2/space/${spaceId}/tag`,
//     {
//       method: 'GET',
//       headers: {
//         'Content-Type': 'application/json',
//         Authorization: process.env.CLICKUP_API_KEY,
//       }
//     }
//   );

//   const data = await resp.json();
//   return data.tags?.map(tag => tag.name) || ['Workspace'];
// }

async function createTask(taskName, cost, sliteNoteLink, tags, listId, parentTask) {
  const query = new URLSearchParams({
    custom_task_ids: 'true',
    team_id: '123'
  }).toString();

  const response = await fetch(
    `https://api.clickup.com/api/v2/list/${listId}/task?${query}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: process.env.CLICKUP_API_KEY
      },
      body: JSON.stringify({
        name: taskName,
        description: `Cf epic: ${sliteNoteLink}`,
        markdown_description: '',
        assignees: [],
        tags: tags || [],
        status: '📦to do',
        check_required_custom_fields: true,
        parent: parentTask?.id,
        points: cost ? Number.parseInt(cost) : undefined,
        custom_fields: [
          {
            id: customFieldsNameToIds.linkToEpic,
            value: sliteNoteLink,
          },
          {
            id: customFieldsNameToIds.storyPoints,
            value: fibonaccis.indexOf(Number.parseInt(cost)),
          }
        ]
      })
    }
  );

  const result = await response.json();
  if (result.err) {
    throw new Error(`Error creating task: ${result.err}`);
  }
  console.log('Task created:', taskName);
  return result;
}

async function hasConfirmedTaskCreation(taskName, cost, parentTask) {
  const suffix = parentTask ? ` (Subtask of "${parentTask.name}")` : '';
  const result = await prompt([{
    name: 'confirm',
    message: `Create task "${taskName}" with "${cost}" story points${suffix}?`,
    type: 'confirm',
  }]);
  return result.confirm;
}


prompt([{
  name: 'noteLink',
  message: 'What is the link to the note?',
  type: 'input',
}, {
  name: 'scopeName',
  message: 'What is the name of the scope? (eg. "Workspace" | "Cloud")',
  type: 'input',
}, {
  name: 'tag',
  message: "Which tag do you want to attach to the stories? (seperated by pipe '|')",
  type: 'input',
}, {
  name: 'team',
  message: "Which team are you from?",
  type: 'list',
  choices: Object.keys(teamsToListId),
  default: 'Ops Team',
}, {
  name: 'confirm',
  message: 'Do you want a confirmation before creating each task?',
  type: 'confirm',
}])
  .then(async answers => {
    const noteId = answers.noteLink.split('/').pop();
    const sliteNode = await getSliteNote(noteId);

    const stories = sliteNode.content.match(/#{2,4}\s*(?:.+)?\s*(Sub(-)?)?Story ([^\n]+)?/g);
    let latestParentTask;
    for (const story of stories) {
      const startIndex = story.indexOf('Story');
      const parts = story.split(' - ');
      const [cost] = parts.pop().match(/\d+/g) || [];
      const storyName = parts.join(' - ').substring(startIndex);
      const taskName = `${answers.scopeName} - ${storyName}`;
      const tags = answers.tag.split('|');
      const isSubTask = story.toLowerCase().includes('sub-story') || story.toLowerCase().includes('substory');
      if (!answers.confirm || await hasConfirmedTaskCreation(taskName, cost, isSubTask ? latestParentTask : undefined)) {
        const task = await createTask(taskName, cost, answers.noteLink, tags, teamsToListId[answers.team], isSubTask ? latestParentTask : undefined);
        if (!isSubTask) {
          latestParentTask = task;
        }
      }
    }
  })
