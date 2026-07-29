import os
from flask import Flask, render_template, jsonify, request
import database

app = Flask(__name__)

# Ensure directories exist
os.makedirs(os.path.join(app.root_path, 'templates'), exist_ok=True)
os.makedirs(os.path.join(app.root_path, 'static', 'css'), exist_ok=True)
os.makedirs(os.path.join(app.root_path, 'static', 'js'), exist_ok=True)

@app.route('/')
def index():
    """Renders the main dashboard of the IDE."""
    return render_template('index.html')

@app.route('/api/exercises', methods=['GET'])
def get_exercises():
    """API endpoint to retrieve all exercises combined with progress."""
    exercises = database.get_exercises_with_progress()
    return jsonify(exercises)

@app.route('/api/exercises/<exercise_id>/submit', methods=['POST'])
def submit_exercise(exercise_id):
    """API endpoint to record an exercise submission and progress."""
    data = request.json or {}
    code = data.get('code', '')
    success = data.get('success', False)
    
    saved = database.save_progress(exercise_id, code, success)
    if saved:
        return jsonify({
            "status": "success",
            "message": "Progreso guardado correctamente",
            "progress": database.load_progress().get(exercise_id, {})
        })
    else:
        return jsonify({
            "status": "error",
            "message": "Error al guardar el progreso en el servidor"
        }), 500

if __name__ == '__main__':
    # Running locally on port 5000 in debug mode
    print("Iniciando AssemblerEasy IDE en http://localhost:5000")
    app.run(host='127.0.0.1', port=5000, debug=True)
