import express from 'express';
import dotenv from 'dotenv';
import { connectMongoDB } from './connection.js';
import useScamRoute from './routes/scamRoute.js'; 
import { apiKeyAuth } from './middlewares/apiKeyAuth.js';


dotenv.config();

// Mongo DB connections
connectMongoDB(process.env.MONGOURL).then(() => { console.log("MongoDB connected") }).catch((err) => console.error(err))
const app = express();
const port = 4000;

// Middlewares 
app.use(express.json())

// API Routes
app.use('/api', apiKeyAuth, useScamRoute);

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log('Server is running at http://localhost:' + port);
});
