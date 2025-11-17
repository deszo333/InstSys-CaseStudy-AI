import axios from "axios";
import cron from "node-cron";

let execution_mode = 'offline';
let timeout = 3000;

export async function callPythonAPI(userQuery, session_id = 22) {
  try {

    if (!userQuery || !session_id) throw new Error("Missing query");

    const response = await axios.post(
      "http://localhost:5001/v1/chat/prompt/response",
      { query: userQuery, session_id: session_id},
    );

    return response.data;
  } catch (error) {
    console.error("Error calling Python AP  I:", error.response?.data || error.message);
    throw error;
  }
}


//  ###################################################
//  toggle switch for Admin mode and Show student Image
//  ###################################################

export async function requestmode(req, res) {

  try {
    await axios.post(
      "http://localhost:5001/v1/chat/prompt/requestmode",
      {ReqChart: Chart, ReqImage: image}
    )
  } catch ( error ) {
    console.error("Error calling Python API:", error.response?.data || error.message);
  }
}

async function networkChecker() {
  try {

    const response = await axios.get("https://clients3.google.com/generate_204", {
      timeout,
      headers: { "Cache-Control": "no-cache" },
      maxRedirects: 0,
      validateStatus: () => true,
    });
    return (response.status >= 200 && response.status < 500) ? "online" : "offline";

  } catch (error) {
    return "offline";
  }
}

export async function configPythonAPI() {

  console.log("Startup Initialization");
  cron.schedule("*/10 * * * * *", async function () {

    try {
      const new_mode = await networkChecker();
      if (new_mode !== execution_mode) {

        execution_mode = new_mode;
        console.log("configuring AI");
        try {
          await axios.post(`http://localhost:5001/v1/chat/prompt/mode/${execution_mode}`, {
            mode: execution_mode,
          });
          console.log(`CHANGING EXECUTION MODE ${execution_mode}`);
        } catch (error) {
          console.error("Error Updating Execution Mode:", error.message);
        }
      }
    } catch (error) {
      console.error("Error Sending Execution Mode.");
      throw error;
    }
  });
}