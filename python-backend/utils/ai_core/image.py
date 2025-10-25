"""
Database Image Backfill Utility

This script connects to the 'school_system' database, iterates through all
student collections, and generates a unique placeholder image for any student
who is missing one.

The generated image is a simple colored background with the student's name
and ID, which is then saved as Base64 data directly into the student's
document. This is a one-time operation to prepare the database for
image-related features.

Dependencies:
- pymongo: pip install pymongo
- Pillow: pip install Pillow
"""
import io
import base64
import random
from datetime import datetime
from pymongo import MongoClient
from PIL import Image, ImageDraw, ImageFont
import sys

class DatabaseImageInitializer:
    """
    Handles the logic for connecting to the database and backfilling
    placeholder images for students.
    """

    def __init__(self, connection_string, database_name, collections_to_process):
        """Initializes the database connection."""
        try:
            self.client = MongoClient(connection_string, serverSelectionTimeoutMS=5000)
            self.client.admin.command('ping')
            self.db = self.client[database_name]
            self.collections = collections_to_process
            print(f"✅ Successfully connected to MongoDB database: '{database_name}'")
        except Exception as e:
            print(f"❌ Could not connect to MongoDB: {e}")
            sys.exit(1)

        self.total_students_processed = 0
        self.total_images_generated = 0

    def generate_placeholder_image(self, name: str, student_id: str) -> bytes:
        """
        Generates a simple, colored placeholder image with text using Pillow.
        """
        # A list of nice, dark background colors for good contrast
        colors = [
            (46, 52, 64), (59, 66, 82), (67, 76, 94),
            (76, 86, 106), (94, 38, 50), (107, 45, 45)
        ]
        bg_color = random.choice(colors)
        text_color = (236, 239, 244)
        img = Image.new('RGB', (400, 200), color=bg_color)
        draw = ImageDraw.Draw(img)

        try:
            # Try to use a common system font, fall back to default if not found
            title_font = ImageFont.truetype("arial.ttf", 24)
            detail_font = ImageFont.truetype("arial.ttf", 18)
        except IOError:
            title_font = ImageFont.load_default()
            detail_font = ImageFont.load_default()

        # Draw text on the image
        draw.text((20, 20), "Placeholder Image", fill=text_color, font=title_font)
        draw.text((20, 80), f"Name: {name}", fill=text_color, font=detail_font)
        draw.text((20, 110), f"ID: {student_id}", fill=text_color, font=detail_font)

        # Save image to an in-memory buffer
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        return buffer.getvalue()

    def process_collections(self):
        """
        Iterates through the specified collections and updates students
        who are missing image data.
        """
        print("\nStarting image backfill process...")

        for coll_name in self.collections:
            print(f"\n--- Processing Collection: '{coll_name}' ---")
            collection = self.db[coll_name]
            
            # Query for students with a student_id but no image.data field
            query = {
                "student_id": {"$exists": True, "$ne": ""},
                "$or": [
                    {"image": {"$exists": False}},
                    {"image.data": {"$exists": False}},
                    {"image.data": None},
                    {"image.data": ""}
                ]
            }
            
            students_to_update = list(collection.find(query))
            count = len(students_to_update)
            self.total_students_processed += count

            if count == 0:
                print("✅ All students in this collection already have image data.")
                continue

            print(f"Found {count} student(s) in '{coll_name}' needing a placeholder image.")
            
            for i, student in enumerate(students_to_update, 1):
                student_id = student.get("student_id")
                full_name = student.get("full_name", "N/A")

                # Generate the image and encode it
                image_bytes = self.generate_placeholder_image(full_name, student_id)
                image_base64 = base64.b64encode(image_bytes).decode('utf-8')

                # Prepare the update query
                update_payload = {
                    "image.data": image_base64,
                    "image.filename": f"{student_id}_placeholder.png",
                    "image.upload_date": datetime.utcnow()
                }

                # Update the document in the database
                collection.update_one(
                    {"_id": student["_id"]},
                    {"$set": update_payload}
                )
                self.total_images_generated += 1
                
                # Print progress
                print(f"  ({i}/{count}) Generated and saved image for {full_name} ({student_id})")

        print("\n--- Image backfill process complete! ---")

    def print_summary(self):
        """Prints a final summary of the operations."""
        print("\n" + "="*50)
        print("📊 FINAL SUMMARY")
        print("="*50)
        print(f"Total students checked: {self.total_students_processed}")
        print(f"Total placeholder images generated: {self.total_images_generated}")
        if self.total_images_generated == 0:
            print("\nIt looks like all students were already up to date!")
        print("="*50)

    def close(self):
        """Closes the database connection."""
        if self.client:
            self.client.close()
            print("\n🔌 Database connection closed.")


if __name__ == "__main__":
    # --- Configuration ---
    MONGO_CONNECTION_STRING = "mongodb://localhost:27017/"
    DATABASE_NAME = "school_system"
    # Add all your student collection names here
    STUDENT_COLLECTIONS = ["students_ccs", "students_cba", "faculty"] 

    initializer = None
    try:
        initializer = DatabaseImageInitializer(
            MONGO_CONNECTION_STRING, 
            DATABASE_NAME, 
            STUDENT_COLLECTIONS
        )
        initializer.process_collections()
        initializer.print_summary()
    except Exception as e:
        print(f"\n❌ An unexpected error occurred: {e}")
    finally:
        if initializer:
            initializer.close()