// Shared by the test files that can run against a real MongoDB (set TEST_MONGO_URI).
//
// Every test file gets its OWN database, named after itself, on the server the URI points to.
// The files run at the same time and each one deletes its database when it finishes, so one
// shared database would have them wiping each other's data mid-run. It also means the database
// named in the URI is never touched: only databases called sutkeri_test_<file> are created, and
// only those are ever dropped.
import mongoose from 'mongoose';

const PREFIX = 'sutkeri_test_';

export async function connectTestDatabase(name) {
  await mongoose.connect(process.env.TEST_MONGO_URI, { dbName: `${PREFIX}${name}` });
  // Start clean even if an earlier run was stopped half way and left its data behind
  await mongoose.connection.dropDatabase();
}

export async function dropTestDatabase() {
  if (!mongoose.connection.name.startsWith(PREFIX)) {
    throw new Error(`refusing to drop "${mongoose.connection.name}": it is not one of the test databases`);
  }
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}
