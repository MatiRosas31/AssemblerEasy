import os
import json

EXERCISES_FILE = os.path.join(os.path.dirname(__file__), 'exercises.json')
PROGRESS_FILE = os.path.join(os.path.dirname(__file__), 'progress.json')

def load_exercises():
    """Loads all static exercises from exercises.json."""
    if not os.path.exists(EXERCISES_FILE):
        return []
    try:
        with open(EXERCISES_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading exercises: {e}")
        return []

def load_progress():
    """Loads user progress from progress.json. Creates it if it doesn't exist."""
    if not os.path.exists(PROGRESS_FILE):
        return {}
    try:
        with open(PROGRESS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading progress: {e}")
        return {}

def save_progress(exercise_id, code, success):
    """Saves user progress for a given exercise."""
    progress = load_progress()
    
    # Initialize exercise progress if not present
    if exercise_id not in progress:
        progress[exercise_id] = {
            "attempts": 0,
            "success": False,
            "code": ""
        }
    
    progress[exercise_id]["attempts"] += 1
    progress[exercise_id]["code"] = code
    # If it was already true, keep it true
    progress[exercise_id]["success"] = progress[exercise_id]["success"] or success
    
    try:
        with open(PROGRESS_FILE, 'w', encoding='utf-8') as f:
            json.dump(progress, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"Error saving progress: {e}")
        return False

def get_exercises_with_progress():
    """Returns the list of exercises combined with the user's progress."""
    exercises = load_exercises()
    progress = load_progress()
    
    for ex in exercises:
        ex_id = ex["id"]
        if ex_id in progress:
            ex["progress"] = progress[ex_id]
        else:
            ex["progress"] = {
                "attempts": 0,
                "success": False,
                "code": ""
            }
            
    return exercises
