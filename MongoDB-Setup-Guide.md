# MongoDB Setup Guide for Sutkeri Application

This guide will help you set up and connect to MongoDB for the Sutkeri application.

## Prerequisites

- Node.js and npm installed
- A MongoDB Atlas account (free tier works fine)

## Setting Up MongoDB Atlas

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and sign up or log in
2. Create a new project (or use an existing one)
3. Create a new cluster (free tier is sufficient)
4. Set up a database user:
   - Go to Database Access → Add New Database User
   - Create a username and password (Save these credentials!)
   - Select appropriate privileges (Read and write to any database is sufficient for development)

5. Whitelist your IP address:
   - Go to Network Access → Add IP Address
   - Add your current IP or use 0.0.0.0/0 for development (not recommended for production)

6. Get your connection string:
   - Go to Clusters → Connect → Connect your application
   - Copy the provided connection string

## Configuring the Application

1. Copy `.env.example` to `.env` in the root directory of the project (`.env` is ignored by git, never commit it)
2. Fill in at least `MONGO_URI`:

```
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<dbname>?retryWrites=true&w=majority
```

3. Replace:
   - `<username>` with your MongoDB Atlas username
   - `<password>` with your MongoDB Atlas password
   - `<cluster>` with your cluster address
   - `<dbname>` with your database name (e.g., "momapp")

4. `JWT_SECRET` signs login tokens. In development you can leave it empty: a random secret is
   created in `data/.jwt-secret`. In production it is **required** (at least 32 random characters):

```
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### When MongoDB is not reachable

- **Development:** the server prints a warning and keeps accounts in a local file,
  `data/users.json` (passwords are bcrypt-hashed, the file is ignored by git). Those accounts
  are not copied to MongoDB later. The start-up log says `USER_STORE: 'file'` when this is active.
- **Production (`NODE_ENV=production`):** nobody can sign in or register until MongoDB is
  reachable, and the server says so on start-up.

## For production

Running for real people needs more care than development. The short version (the full guide is
in `docs/DEPLOYMENT.md`):

- Use a tier that has **real backups**, and restore one once to see that it works. Check the
  Backup page of the tier before you choose it.
- Make a **separate database user** for the app with the `readWrite` role on this one database,
  not an administrator.
- In Network Access, allow only the address your host connects from, if it has a fixed one. If
  it has not, `0.0.0.0/0` makes the password the only protection: make it long and random.
- Choose a region and write it in the privacy policy.
- `npm run check:production` connects with your `MONGO_URI` and tells you whether it works.

When the app starts it builds the indexes it needs (one account per email, expiring sign-out and
link entries). If it cannot, it says why and refuses to use that database.

## Testing the Connection

Run the test connection script:

```
node test-db-connection.js
```

If successful, you should see a message confirming the connection.

## Troubleshooting Common Issues

### Connection Refused
- Check if your IP is whitelisted in MongoDB Atlas Network Access
- Verify your connection string is correct

### Authentication Failed
- Check if username and password in the connection string are correct
- Ensure the user has the necessary permissions

### Cannot Find Module 'mongoose'
- Run `npm install mongoose` to install the required package

### JWT Authentication Issues
- In production, `JWT_SECRET` must be set (32+ characters) or the server refuses to start
- After changing `JWT_SECRET`, everyone has to sign in again (old tokens stop working)

### `ENOTFOUND` / `querySrv` when connecting
- The cluster host name in `MONGO_URI` does not exist (the cluster was deleted or the address is wrong). Copy a fresh connection string from Atlas.

## Using MongoDB Compass (Optional)

MongoDB Compass is a graphical user interface for MongoDB that makes it easier to explore and manipulate your data:

1. Download and install [MongoDB Compass](https://www.mongodb.com/products/compass)
2. Use your connection string to connect to your database
3. Explore collections, documents, and run queries graphically

## Need More Help?

If you're still experiencing issues, please:

1. Check the server logs for specific error messages
2. Ensure all environment variables are correctly set
3. Verify that your MongoDB Atlas account is active and not restricted