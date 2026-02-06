import { configDotenv } from 'dotenv';
configDotenv()
const keys = [process.env.GROQ_API_1, process.env.GROQ_API_2, process.env.GROQ_API_3];
let currentKey = -1; // Start at -1 so first call returns keys[0]

function getGroqKey(){
    currentKey = (currentKey + 1) % keys.length;
    console.log("API key using : ", currentKey);
    return keys[currentKey];
}
export { getGroqKey }
