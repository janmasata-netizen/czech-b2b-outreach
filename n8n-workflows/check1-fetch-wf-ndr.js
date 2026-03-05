const http = require('http');

const options = {
  hostname: '72.62.53.244',
  port: 32770,
  path: '/api/v1/workflows/xMPbk9HwSRGjBbdq',
  method: 'GET',
  headers: {
    'X-N8N-API-KEY': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI3NTI1ZDYwYS0zZmU3LTQyZmQtOWIwZi0xMDM4MDZlNmQwOWYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiN2ViMjJkM2MtNzMyZi00YmJhLTgwMjctMWIzYjI3YTM1MzA1IiwiaWF0IjoxNzcxNTMyNDI1fQ.I__zvKEPw3p-TKR0GZ7I9n0Kd6OIYwElpprF7xovxrM',
    'Content-Type': 'application/json'
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => { data += chunk; });
  res.on('end', () => {
    try {
      const workflow = JSON.parse(data);
      console.log('=== CHECK 1: wf-ndr-monitor WORKFLOW ===\n');
      console.log('Active:', workflow.active);
      console.log('VersionId:', workflow.versionId);
      console.log('ActiveVersionId:', workflow.activeVersionId);
      console.log('\n--- NODES ---');
      workflow.nodes.forEach(node => {
        console.log(`\nNode: ${node.name}`);
        console.log(`  Type: ${node.type}`);
        console.log(`  TypeVersion: ${node.typeVersion}`);
        console.log(`  Parameters: ${JSON.stringify(node.parameters, null, 2)}`);
        if (node.credentials) {
          console.log(`  Credentials: ${JSON.stringify(node.credentials, null, 2)}`);
        }
      });
      console.log('\n--- CONNECTIONS ---');
      console.log(JSON.stringify(workflow.connections, null, 2));
    } catch (e) {
      console.log('Error parsing response:', e.message);
      console.log('Raw response:', data.substring(0, 1000));
    }
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.end();
