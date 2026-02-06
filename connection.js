import mongoose from 'mongoose';

function connectMongoDB(url){
    return mongoose.connect(url, {
        serverSelectionTimeoutMS: 30000, // 30 second timeout for server selection
        socketTimeoutMS: 45000, // 45 second timeout for socket operations
        maxPoolSize: 10, // Maximum 10 connections in pool
        minPoolSize: 2, // Minimum 2 connections to maintain
        connectTimeoutMS: 30000, // 30 second timeout for initial connection
    });
}

export { connectMongoDB };