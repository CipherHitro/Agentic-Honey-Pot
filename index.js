import express from 'express';
import dotenv from 'dotenv';
import { connectMongoDB } from './connection.js';
import useScamRoute from './routes/scamRoute.js';

dotenv.config();

// Mongo DB connections
connectMongoDB("mongodb://localhost:27017/?directConnection=true").then(() => {console.log("MongoDB connected")}).catch((err) => console.error(err))
const app = express();
const port = 4000; 

// Middlewares 
app.use(express.json())

// API Routes
app.use('/api', useScamRoute);
// app.use('/api', responseRoute);

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log('Server is running at http://localhost:'+port);
});

