import { configDotenv } from 'dotenv';
configDotenv()
const keys = [process.env.GROQ_API_1, process.env.GROQ_API_2, process.env.GROQ_API_3];
let currentKey = 0;

function getGroqKey(){
    currentKey = (currentKey + 1) % keys.length
    return keys[currentKey];
}
export { getGroqKey }
