import json
import os
import webbrowser
from html import escape

def create_html_preview_with_images():

    print("Generating HTML preview with rendered images...")

    try:
        base_path = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        json_input_path = os.path.join(base_path, "latest_response_data.json")
        html_output_path = os.path.join(base_path, "response_preview.html")
    except NameError:
        json_input_path = "latest_response_data.json"
        html_output_path = "response_preview.html"

    try:
        with open(json_input_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"Error: Input file not found at '{json_input_path}'")
        return
    except json.JSONDecodeError:
        print(f"Error: Could not parse JSON from '{json_input_path}'.")
        return

    ai_response = data.get("ai_response", "No AI response found.")
    image_map = data.get("image_map", {"by_id": {}, "by_name": {}})

    formatted_ai_response = escape(ai_response).replace('\n', '<br>')

    images_by_id_html = ""
    if image_map.get("by_id"):
        for student_id, base64_data in image_map["by_id"].items():
            images_by_id_html += f"""
            <div class="image-card">
                <img src="data:image/png;base64,{base64_data}" alt="Image for {escape(student_id)}">
                <p class="caption">{escape(student_id)}</p>
            </div>
            """
    else:
        images_by_id_html = "<p>No images found by ID.</p>"

    images_by_name_html = ""
    if image_map.get("by_name"):
        for name, base64_data in image_map["by_name"].items():
            images_by_name_html += f"""
            <div class="image-card">
                <img src="data:image/png;base64,{base64_data}" alt="Image for {escape(name)}">
                <p class="caption">{escape(name)}</p>
            </div>
            """
    else:
        images_by_name_html = "<p>No images found by name.</p>"
        
    html_template = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>AI Response Preview</title>
        <style>
            body {{ font-family: sans-serif; background-color: #121212; color: #e0e0e0; line-height: 1.6; padding: 20px; }}
            .container {{ max-width: 90%; margin: auto; background-color: #1e1e1e; border: 1px solid #333; border-radius: 8px; padding: 15px 30px; }}
            h2 {{ color: #bb86fc; border-bottom: 2px solid #333; padding-bottom: 10px; }}
            h3 {{ color: #03dac6; margin-top: 25px; }}
            .image-gallery {{ display: flex; flex-wrap: wrap; gap: 20px; margin-top: 15px; padding-top: 10px; border-top: 1px solid #333;}}
            .image-card {{ background-color: #252525; border: 1px solid #3c3c3c; border-radius: 8px; padding: 10px; text-align: center; width: 220px; }}
            .image-card img {{ max-width: 100%; height: auto; border-radius: 4px; border: 1px solid #444; }}
            .caption {{ margin-top: 10px; font-size: 0.9em; color: #ccc; word-wrap: break-word; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h2>AI Response</h2>
            <p>{formatted_ai_response}</p>
            <hr style="border-color: #333; margin: 30px 0;">
            <h2>Mapped Images</h2>
            <h3>Found by ID:</h3>
            <div class="image-gallery">{images_by_id_html}</div>
            <h3>Found by Name:</h3>
            <div class="image-gallery">{images_by_name_html}</div>
        </div>
    </body>
    </html>
    """

    with open(html_output_path, "w", encoding="utf-8") as f:
        f.write(html_template)

    print(f"HTML preview with images created: '{os.path.realpath(html_output_path)}'")
    
    try:
        webbrowser.open_new_tab(f'file://{os.path.realpath(html_output_path)}')
    except Exception as e:
        print(f"Could not automatically open the file in a browser: {e}")

if __name__ == "__main__":
    create_html_preview_with_images()