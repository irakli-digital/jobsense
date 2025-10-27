const { MongoClient } = require('mongodb');
require('dotenv').config();

async function checkAgentDetailed() {
  const client = new MongoClient(process.env.MONGO_URI);

  try {
    await client.connect();
    const db = client.db();

    // Find the JobSense agent
    const agent = await db.collection('agents')
      .findOne({ name: /JobSense/i });

    if (agent) {
      console.log('=== Full Agent Configuration ===\n');
      console.log('Agent ID:', agent.id);
      console.log('MongoDB _id:', agent._id);
      console.log('Name:', agent.name);
      console.log('Provider:', agent.provider);
      console.log('Model:', agent.model);
      console.log('\nTools:', JSON.stringify(agent.tools, null, 2));
      console.log('Tool kwargs:', JSON.stringify(agent.tool_kwargs, null, 2));

      console.log('\n=== Latest Version ===\n');
      if (agent.versions && agent.versions.length > 0) {
        const latestVersion = agent.versions[agent.versions.length - 1];
        console.log('Version Provider:', latestVersion.provider);
        console.log('Version Model:', latestVersion.model);
        console.log('Version Tools:', JSON.stringify(latestVersion.tools, null, 2));
        console.log('Version Tool kwargs:', JSON.stringify(latestVersion.tool_kwargs, null, 2));
      }
    } else {
      console.log('JobSense agent not found!');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
  }
}

checkAgentDetailed();
