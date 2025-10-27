const { MongoClient } = require('mongodb');
require('dotenv').config();

async function checkAgentTools() {
  const client = new MongoClient(process.env.MONGO_URI);

  try {
    await client.connect();
    const db = client.db();

    // Find the JobSense agent
    const agent = await db.collection('agents')
      .findOne({ name: /JobSense/i });

    if (agent) {
      console.log('JobSense Agent ID:', agent.id);
      console.log('Agent Name:', agent.name);
      console.log('\n=== Agent Tools Configuration ===');
      console.log('Tools array:', JSON.stringify(agent.tools, null, 2));
      console.log('\nTools count:', agent.tools ? agent.tools.length : 0);

      if (agent.versions && agent.versions.length > 0) {
        console.log('\n=== Latest Version Tools ===');
        const latestVersion = agent.versions[agent.versions.length - 1];
        console.log('Version tools:', JSON.stringify(latestVersion.tools, null, 2));
        console.log('Version tools count:', latestVersion.tools ? latestVersion.tools.length : 0);
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

checkAgentTools();
