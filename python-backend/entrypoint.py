import uvicorn #type: ignore
from fastapi.middleware.cors import CORSMiddleware #type: ignore
from fastapi import FastAPI, Request, HTTPException#type: ignore
from fastapi.responses import JSONResponse #type: ignore
from utils.run_ai import endpoint_connection, list_all_collections
from utils.mongo_image_mapper import build_image_map_from_mongo

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------Route----------------------

ai_analyst, ai_chart = endpoint_connection()
requestChart = False
requestImage = False

@app.post("/v1/chat/prompt/requestmode")
async def request_mode(mode: bool):
    global requestChart, requestImage
    
    requestChart, requestImage = mode["ReqChart"], mode["ReqImage"]

@app.post("/v1/chat/prompt/collection")
async def Login_collection(request: Request):
    global ai_analyst, ai_chart
    
    data = await request.json()
    role = data.get("role")
    assign = data.get("assign")
    
    
    collection = list_all_collections(role= role, assign = assign)
    ai_analyst, ai_chart = endpoint_connection(collection)
    

@app.post("/v1/chat/prompt/mode/{mode}")
async def change_mode(mode: str):
    global ai_analyst
    
    valid_modes = ["online", "offline"]
    if mode not in valid_modes:
        raise HTTPException(status_code=400, detail="Invalide Execution mode.")
    
    if ai_analyst is None:
        raise HTTPException(status_code=400, detail="AI Analyst not initialized.")
    
    ai_analyst.executiona_mode = mode
    print(f" Execution mode set to: {mode}")
    
@app.post("/v1/chat/prompt/response")
async def ChatPrompt(request: Request):
    global ai_analyst
    if ai_analyst is None:
        raise HTTPException(status_code=400, detail="AI Analyst not configured.")
    
    data = await request.json()
    if not data or 'query' not in data:
        raise HTTPException(status_code=400, detail="Missing query")
    
    user_query, session_id = data['query'], data['session_id']
    final_answer = ai_analyst.web_start_ai_analyst(user_query=user_query, session_id= session_id)
    return JSONResponse({"response": final_answer}, status_code=201)

# ----------------------Route----------------------

if __name__ == "__main__":
    
    uvicorn.run("entrypoint:app", port=5001, reload=True)