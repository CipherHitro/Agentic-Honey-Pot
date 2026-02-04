const express = require('express');
require('dotenv').config();
const { connectMongoDB } = require('./connection')
const useScamRoute  = require('./routes/scamRoute')

// Mongo DB connections
connectMongoDB(process.env.MONGOURL).then(() => {console.log("MongoDB connected")}).catch((err) => console.error(err))
const app = express();
const port = 4000; 

// Middlewares 
app.use(express.json())


// API Routes
app.use('/api', useScamRoute);

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log('Server is running at http://localhost:'+port);
});

