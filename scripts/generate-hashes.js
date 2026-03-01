import bcrypt from 'bcrypt';

const passwords = {
  'admin123': 'admin@blakvote.test',
  'organizer123': 'organizer@blakvote.test',
  'voter123': 'voter1@blakvote.test, voter2@blakvote.test, voter3@blakvote.test'
};

async function generateHashes() {
  for (const [password, emails] of Object.entries(passwords)) {
    const hash = await bcrypt.hash(password, 10);
    console.log(`Password: "${password}"`);
    console.log(`Hash: "${hash}"`);
    console.log(`Emails: ${emails}`);
    console.log('---');
  }
}

generateHashes().catch(console.error);
