/**
 * AssemblerEasy - UI Controller
 * Manages UI interactions, binds event listeners, coordinates VM simulation, and handles rendering.
 */

document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const exercisesList = document.getElementById('exercises-list');
    const selectManualArch = document.getElementById('select-manual-arch');
    const btnSandbox = document.getElementById('btn-sandbox');
    const btnRun = document.getElementById('btn-run');
    const btnStep = document.getElementById('btn-step');
    const btnPrev = document.getElementById('btn-prev');
    const btnReset = document.getElementById('btn-reset');
    const btnVerify = document.getElementById('btn-verify');
    const bitCounter = document.getElementById('bit-counter');
    const codeEditor = document.getElementById('code-editor');
    const editorLineNumbers = document.getElementById('editor-line-numbers');
    const consoleLog = document.getElementById('console-log');
    const btnClearConsole = document.getElementById('btn-clear-console');
    
    // Division toggles
    const btnDivFloat = document.getElementById('btn-div-float');
    const btnDivInt = document.getElementById('btn-div-int');

    // Exercise details elements
    const exerciseHeaderPanel = document.getElementById('exercise-header-panel');
    const sandboxHeaderPanel = document.getElementById('sandbox-header-panel');
    const exBadge = document.getElementById('ex-badge');
    const exSuccessBadge = document.getElementById('ex-success-badge');
    const exTitle = document.getElementById('ex-title');
    const exReqArch = document.getElementById('ex-req-arch');
    const exDesc = document.getElementById('ex-desc');
    const exHintContainer = document.getElementById('ex-hint-container');
    const exHint = document.getElementById('ex-hint');
    const sandboxArchBadge = document.getElementById('sandbox-arch-badge');

    // Visual State Elements
    const panelVisStack = document.getElementById('panel-vis-stack');
    const panelVisAccumulator = document.getElementById('panel-vis-accumulator');
    const panelVisRegister = document.getElementById('panel-vis-register');
    const stackItemsContainer = document.getElementById('stack-items-container');
    const stackEmptyMsg = document.getElementById('stack-empty-msg');
    const stackDepth = document.getElementById('stack-depth');
    const accValueBox = document.getElementById('acc-value-box');
    const memoryTableBody = document.getElementById('memory-table-body');
    const pcTraceContainer = document.getElementById('pc-trace-container');
    const pcStatus = document.getElementById('pc-status');
    const cycleStatus = document.getElementById('cycle-status');

    // Application State
    let exercises = [];
    let selectedExercise = null;
    let currentArchitecture = 'stack'; // Default Sandbox mode
    const simulator = new window.AssemblerSimulator();

    // Sandbox initial templates
    const sandboxTemplates = {
        'stack': `; Sandbox Pila\nPUSH a\nPUSH b\nADD\nPOP z\n\n; Variables\na = 10\nb = 20\nz = 0`,
        'accumulator': `; Sandbox Acumulador\nLDA a\nADD b\nSTA z\n\n; Variables\na = 12\nb = 8\nz = 0`,
        'register-2op': `; Sandbox Registros 2 operandos\nMOV a, R0\nMOV b, R1\nADD R0, R1\nMOV R1, z\n\n; Variables\na = 15\nb = 5\nz = 0`,
        'register-3op': `; Sandbox Registros 3 operandos\nMOV a, R0\nMOV b, R1\nADD R0, R1, R2\nMOV R2, z\n\n; Variables\na = 25\nb = 12\nz = 0`,
        'register-custom-9a': `; Sandbox Registros UDE (Ej 9a)\nADD R7, 2400, R0  ; R0 <- 0 + Mem[2400]\nADD R0, 2500, R1  ; R1 <- R0 + Mem[2500]\nADD R1, R7, 2600  ; Mem[2600] <- R1 + 0\n\n; Variables/Direcciones\n2400 = 15\n2500 = 25\n2600 = 0`
    };

    // Keep track of last parsed variables/memory from comments (only in Sandbox)
    let sandboxInitialMemory = {};

    // ----------------------------------------------------
    // INICIALIZACIÓN
    // ----------------------------------------------------
    
    // Fetch exercises on load
    fetchExercises();
    
    // Set default sandbox template
    loadSandbox('stack');

    // ----------------------------------------------------
    // PERSISTENCIA EN LOCAL STORAGE
    // ----------------------------------------------------
    const STORAGE_KEY = 'assemblereasy_progress';

    function getLocalProgress() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : {};
        } catch (e) {
            console.error("Error reading progress from localStorage:", e);
            return {};
        }
    }

    function saveLocalProgress(exerciseId, code, success) {
        try {
            const progress = getLocalProgress();
            if (!progress[exerciseId]) {
                progress[exerciseId] = {
                    attempts: 0,
                    success: false,
                    code: ""
                };
            }
            progress[exerciseId].attempts += 1;
            progress[exerciseId].code = code;
            progress[exerciseId].success = progress[exerciseId].success || success;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
            return true;
        } catch (e) {
            console.error("Error saving progress to localStorage:", e);
            return false;
        }
    }

    function fetchExercises() {
        fetch('exercises.json')
            .then(res => {
                if (!res.ok) throw new Error("No se pudo cargar el archivo de ejercicios");
                return res.json();
            })
            .then(data => {
                const progress = getLocalProgress();
                // Combinar la lista estática de ejercicios con el progreso local del alumno
                exercises = data.map(ex => {
                    const exProgress = progress[ex.id] || {
                        attempts: 0,
                        success: false,
                        code: ""
                    };
                    return { ...ex, progress: exProgress };
                });
                
                renderExercisesList();
                // Si hay un ejercicio activo, recargarlo para sincronizar el progreso
                if (selectedExercise) {
                    const updatedEx = exercises.find(e => e.id === selectedExercise.id);
                    if (updatedEx) {
                        selectedExercise = updatedEx;
                        updateExerciseUI();
                    }
                }
            })
            .catch(err => {
                console.error("Error fetching exercises:", err);
                logToConsole("Error al cargar los ejercicios desde el archivo JSON local.", "red");
            });
    }

    function submitProgress(exerciseId, code, success) {
        const saved = saveLocalProgress(exerciseId, code, success);
        if (saved) {
            // Refrescar la lista de ejercicios para actualizar los badges de éxito
            fetchExercises();
        } else {
            logToConsole("Error al guardar el progreso en el LocalStorage.", "yellow");
        }
    }

    // ----------------------------------------------------
    // UI RENDERING
    // ----------------------------------------------------
    function renderExercisesList() {
        exercisesList.innerHTML = '';
        
        // Group by architecture
        const groups = {
            'stack': { name: 'Máquina de Pila', color: 'border-cyan-500 text-cyan-400 bg-cyan-950/20' },
            'accumulator': { name: 'Máquina de Acumulador', color: 'border-emerald-500 text-emerald-400 bg-emerald-950/20' },
            'register': { name: 'Máquinas de Registros', color: 'border-amber-500 text-amber-400 bg-amber-950/20' }
        };

        const categories = {
            'stack': [],
            'accumulator': [],
            'register': []
        };

        exercises.forEach(ex => {
            if (ex.architecture === 'stack') {
                categories.stack.push(ex);
            } else if (ex.architecture === 'accumulator') {
                categories.accumulator.push(ex);
            } else {
                categories.register.push(ex);
            }
        });

        Object.keys(categories).forEach(cat => {
            const catExercises = categories[cat];
            if (catExercises.length === 0) return;

            // Header for category
            const catHeader = document.createElement('div');
            catHeader.className = `px-3 py-1.5 mt-3 rounded-md text-[10px] font-bold uppercase tracking-wider border-l-2 ${groups[cat].color}`;
            catHeader.textContent = groups[cat].name;
            exercisesList.appendChild(catHeader);

            // Exercise items
            catExercises.forEach(ex => {
                const exItem = document.createElement('button');
                exItem.className = `w-full text-left p-2.5 rounded-lg text-xs transition-all flex items-center justify-between cursor-pointer group ${
                    selectedExercise && selectedExercise.id === ex.id 
                        ? 'bg-violet-900/40 border border-violet-500/40 text-slate-100 shadow-md' 
                        : 'hover:bg-slate-900 border border-transparent text-slate-400 hover:text-slate-200'
                }`;
                
                // Content
                const titleSpan = document.createElement('span');
                titleSpan.className = "truncate pr-2 font-medium";
                titleSpan.textContent = ex.title;
                exItem.appendChild(titleSpan);

                // Success icon
                if (ex.progress && ex.progress.success) {
                    const successBadge = document.createElement('span');
                    successBadge.className = "flex-shrink-0 w-4 h-4 rounded-full bg-emerald-950 border border-emerald-500/60 flex items-center justify-center text-[10px] text-emerald-400 font-bold";
                    successBadge.innerHTML = "&#10004;";
                    exItem.appendChild(successBadge);
                } else if (ex.progress && ex.progress.attempts > 0) {
                    const attemptBadge = document.createElement('span');
                    attemptBadge.className = "flex-shrink-0 text-[10px] text-slate-500 font-bold font-mono px-1 bg-slate-800 rounded border border-slate-700";
                    attemptBadge.textContent = `${ex.progress.attempts}`;
                    exItem.appendChild(attemptBadge);
                }

                exItem.addEventListener('click', () => selectExercise(ex));
                exercisesList.appendChild(exItem);
            });
        });
    }

    function selectExercise(ex) {
        selectedExercise = ex;
        currentArchitecture = ex.architecture;
        
        // Hide manual selections and sandbox headers
        sandboxHeaderPanel.classList.add('hidden');
        exerciseHeaderPanel.classList.remove('hidden');
        btnVerify.classList.remove('hidden');
        selectManualArch.disabled = true; // Block manual changing during exercise

        updateExerciseUI();

        // Initialize Simulator code
        let savedCode = ex.progress && ex.progress.code ? ex.progress.code : '';
        if (!savedCode) {
            // Load a friendly boilerplate
            if (ex.architecture === 'stack') {
                savedCode = `; Ejercicio ${ex.title}\n; Usa instrucciones PUSH, POP, ADD, SUB, MUL, DIV\n\n`;
            } else if (ex.architecture === 'accumulator') {
                savedCode = `; Ejercicio ${ex.title}\n; Usa instrucciones LDA, STA, ADD, SUB, MUL, DIV\n\n`;
            } else {
                savedCode = `; Ejercicio ${ex.title}\n\n`;
            }
        }
        
        codeEditor.value = savedCode;
        
        // Parse & Setup Simulator
        resetVM();
        syncLineNumbers();
        logToConsole(`Cargado: ${ex.title}. Modo de arquitectura: ${currentArchitecture.toUpperCase()}.`, "violet");
        
        renderExercisesList(); // Re-render to highlight active item
    }

    function updateExerciseUI() {
        if (!selectedExercise) return;
        
        exTitle.textContent = selectedExercise.title;
        exDesc.innerHTML = selectedExercise.description.replace(/\n/g, '<br>');
        exReqArch.textContent = currentArchitecture.replace('register-', 'Regs ').toUpperCase();

        // Architecture Badge Styling
        exBadge.className = "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ";
        if (currentArchitecture === 'stack') {
            exBadge.classList.add('badge-stack');
            exBadge.textContent = 'Pila';
        } else if (currentArchitecture === 'accumulator') {
            exBadge.classList.add('badge-accumulator');
            exBadge.textContent = 'Acumulador';
        } else if (currentArchitecture.startsWith('register')) {
            exBadge.classList.add('badge-register');
            exBadge.textContent = currentArchitecture === 'register-custom-9a' ? 'Regs Especial' : 'Registros';
        }

        // Hint handling
        if (selectedExercise.hint) {
            exHintContainer.classList.remove('hidden');
            exHint.textContent = selectedExercise.hint;
        } else {
            exHintContainer.classList.add('hidden');
        }

        // Show/hide completed check
        if (selectedExercise.progress && selectedExercise.progress.success) {
            exSuccessBadge.classList.remove('hidden');
        } else {
            exSuccessBadge.classList.add('hidden');
        }

        updateVisualizerVisibility();
    }

    function loadSandbox(arch) {
        selectedExercise = null;
        currentArchitecture = arch;

        // UI toggling
        exerciseHeaderPanel.classList.add('hidden');
        sandboxHeaderPanel.classList.remove('hidden');
        btnVerify.classList.add('hidden');
        selectManualArch.disabled = false;
        selectManualArch.value = arch;

        // Sandbox architecture badge update
        sandboxArchBadge.className = "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ";
        if (arch === 'stack') {
            sandboxArchBadge.classList.add('badge-stack');
            sandboxArchBadge.textContent = 'Pila (Stack) Sandbox';
        } else if (arch === 'accumulator') {
            sandboxArchBadge.classList.add('badge-accumulator');
            sandboxArchBadge.textContent = 'Acumulador Sandbox';
        } else if (arch.startsWith('register')) {
            sandboxArchBadge.classList.add('badge-register');
            sandboxArchBadge.textContent = arch === 'register-custom-9a' ? 'Regs Especial Sandbox' : `Registros (${arch === 'register-2op' ? '2 Op' : '3 Op'}) Sandbox`;
        }

        updateVisualizerVisibility();
        
        // Load template
        codeEditor.value = sandboxTemplates[arch];
        
        resetVM();
        syncLineNumbers();
        logToConsole(`Modo Libre Sandbox iniciado. Arquitectura: ${arch.toUpperCase()}.`, "cyan");
        renderExercisesList(); // Unselect current exercise in list
    }

    function updateVisualizerVisibility() {
        // Hide all
        panelVisStack.classList.add('hidden');
        panelVisAccumulator.classList.add('hidden');
        panelVisRegister.classList.add('hidden');

        // Show relevant
        if (currentArchitecture === 'stack') {
            panelVisStack.classList.remove('hidden');
        } else if (currentArchitecture === 'accumulator') {
            panelVisAccumulator.classList.remove('hidden');
        } else if (currentArchitecture.startsWith('register')) {
            panelVisRegister.classList.remove('hidden');
        }
    }

    // ----------------------------------------------------
    // COMPILER & SIMULATION TRIGGERS
    // ----------------------------------------------------

    function parseEditorCode() {
        const code = codeEditor.value;
        
        // Parse comments for variables only in Sandbox Mode
        if (!selectedExercise) {
            parseSandboxVariables(code);
        }

        const errors = simulator.parse(code, currentArchitecture);
        
        // Calculate Bit Length and update view
        const bitSize = simulator.calculateCodeSizeInBits(currentArchitecture);
        bitCounter.textContent = `${bitSize} bits`;

        // Render console errors or success
        if (errors.length > 0) {
            logClear();
            errors.forEach(err => {
                logToConsole(`Línea ${err.lineNum}: ${err.message}`, "red");
            });
        } else {
            // Keep console clean or show syntax ok
            clearSyntaxErrors();
        }

        renderPCTrace();
        return errors.length === 0;
    }

    function parseSandboxVariables(code) {
        // Look for definitions in comments or code lines like `a = 10` or `2400 = 15`
        sandboxInitialMemory = {};
        const lines = code.split('\n');
        lines.forEach(line => {
            // Match something like "a = 10" or "2400 = 15"
            // Strip comment characters first but look at the entire raw line
            const clean = line.replace(/^\s*[;//]\s*/, '').trim();
            const match = clean.match(/^([a-zA-Z0-9_]+)\s*=\s*(-?[0-9.]+)\s*$/);
            if (match) {
                const varName = match[1];
                const value = parseFloat(match[2]);
                sandboxInitialMemory[varName] = value;
            }
        });
    }

    function getInitialState() {
        if (selectedExercise) {
            // Copy deep state from exercise JSON
            const copy = JSON.parse(JSON.stringify(selectedExercise.initialState));
            return copy;
        } else {
            // Sandbox initial state
            const state = {
                memory: { ...sandboxInitialMemory },
                registers: { R0: 0, R1: 0, R2: 0, R3: 0, R4: 0, R5: 0, R6: 0, R7: 0 },
                stack: [],
                acc: 0
            };
            return state;
        }
    }

    function resetVM() {
        parseEditorCode();
        const init = getInitialState();
        simulator.initVM(init);
        updateVMViews();
        btnPrev.disabled = true;
    }

    function stepForward() {
        // Re-parse code first to sync any changes in editor
        parseEditorCode();
        
        if (simulator.instructions.length === 0) {
            logToConsole("No hay instrucciones para ejecutar.", "yellow");
            return;
        }

        const prevPC = simulator.state.pc;
        const prevStatus = simulator.state.status;
        
        simulator.stepForward(currentArchitecture);
        
        btnPrev.disabled = false;
        updateVMViews(prevPC);

        const state = simulator.state;
        if (state.status === 'error') {
            logToConsole(state.errorMsg, "red");
        } else if (state.status === 'halted' && prevStatus !== 'halted') {
            logToConsole(`Programa finalizado. Ciclos ejecutados: ${state.cycleCount}`, "emerald");
        } else if (prevPC < simulator.instructions.length) {
            const inst = simulator.instructions[prevPC];
            logToConsole(`Paso PC ${prevPC}: ${inst.raw}`);
        }
    }

    function stepBackward() {
        const prevPC = simulator.state.pc;
        const success = simulator.stepBack();
        if (success) {
            updateVMViews();
            logToConsole("Retrocedido a paso anterior.");
            if (simulator.stateHistory.length <= 1) {
                btnPrev.disabled = true;
            }
        }
    }

    function runToCompletion() {
        parseEditorCode();
        
        if (simulator.instructions.length === 0) {
            logToConsole("No hay instrucciones para ejecutar.", "yellow");
            return;
        }

        // If already halted or error, reset first
        if (simulator.state.status === 'halted' || simulator.state.status === 'error') {
            const init = getInitialState();
            simulator.initVM(init);
        }

        logToConsole("Ejecutando programa...", "violet");
        
        let limit = 0;
        const maxLimit = 1000; // infinite loop protection
        
        while (simulator.state.status !== 'halted' && simulator.state.status !== 'error' && limit < maxLimit) {
            simulator.stepForward(currentArchitecture);
            limit++;
        }

        updateVMViews();
        btnPrev.disabled = simulator.stateHistory.length <= 1;

        if (simulator.state.status === 'error') {
            logToConsole(simulator.state.errorMsg, "red");
        } else if (limit >= maxLimit) {
            logToConsole("Bucle infinito detectado. Ejecución interrumpida.", "red");
        } else {
            logToConsole(`Ejecución terminada con éxito. Ciclos totales: ${simulator.state.cycleCount}`, "emerald");
        }
    }

    function verifyExercise() {
        if (!selectedExercise) return;

        // Parse editor first
        const ok = parseEditorCode();
        if (!ok) {
            logToConsole("No se puede validar debido a errores de sintaxis.", "red");
            return;
        }

        if (simulator.instructions.length === 0) {
            logToConsole("El programa está vacío.", "red");
            return;
        }

        logToConsole("Comenzando validación del ejercicio...", "violet");
        let allTestsPassed = true;
        const testCases = selectedExercise.testCases;

        for (let tIdx = 0; tIdx < testCases.length; tIdx++) {
            const test = testCases[tIdx];
            
            // Build test VM state
            const testVM = new window.AssemblerSimulator();
            testVM.setDivisionMode(simulator.divisionMode);
            testVM.parse(codeEditor.value, currentArchitecture);
            
            // Generate initial state loaded with test inputs
            const testInitState = getInitialState();
            
            // Override variables in memory with test case inputs
            Object.keys(test.inputs).forEach(key => {
                testInitState.memory[key] = test.inputs[key];
            });

            testVM.initVM(testInitState);

            // Run test VM to completion
            let limit = 0;
            const maxLimit = 1000;
            while (testVM.state.status !== 'halted' && testVM.state.status !== 'error' && limit < maxLimit) {
                testVM.stepForward(currentArchitecture);
                limit++;
            }

            // Verify outputs
            let testPassed = true;
            let failDetails = [];

            if (testVM.state.status === 'error') {
                testPassed = false;
                failDetails.push(`Error de ejecución: ${testVM.state.errorMsg}`);
            } else if (limit >= maxLimit) {
                testPassed = false;
                failDetails.push("Bucle infinito detectado");
            } else {
                // Check all expected outputs in memory
                Object.keys(test.outputs).forEach(outKey => {
                    const expected = test.outputs[outKey];
                    const obtained = testVM.state.memory[outKey] !== undefined ? testVM.state.memory[outKey] : undefined;
                    
                    // Allow small float tolerance (e.g. 0.0001)
                    if (obtained === undefined || Math.abs(obtained - expected) > 0.0001) {
                        testPassed = false;
                        failDetails.push(`Variable '${outKey}' esperada=${expected}, obtenido=${obtained}`);
                    }
                });
            }

            if (testPassed) {
                logToConsole(`Caso de prueba #${tIdx + 1}: exitoso.`, "slate");
            } else {
                allTestsPassed = false;
                logToConsole(`Caso de prueba #${tIdx + 1}: FALLADO. Detalle: ${failDetails.join(', ')}`, "red");
            }
        }

        const success = allTestsPassed;
        const currentCode = codeEditor.value;
        
        if (success) {
            logToConsole("¡FELICITACIONES! Todos los casos de prueba han pasado con éxito. Tu solución es correcta.", "emerald");
            // Highlight success badge in IDE
            exSuccessBadge.classList.remove('hidden');
        } else {
            logToConsole("La solución no es correcta. Corrige los casos fallados e intenta nuevamente.", "red");
        }

        // Save progress to database
        submitProgress(selectedExercise.id, currentCode, success);
    }

    // ----------------------------------------------------
    // RENDER VISUAL STATE
    // ----------------------------------------------------
    
    function updateVMViews(prevPC = null) {
        const state = simulator.state;
        const prevState = simulator.stateHistory.length > 1 
            ? simulator.stateHistory[simulator.stateHistory.length - 2] 
            : null;

        // 1. Stack VM
        if (currentArchitecture === 'stack') {
            stackDepth.textContent = `Tope: ${state.stack.length}`;
            stackItemsContainer.innerHTML = '';
            
            if (state.stack.length === 0) {
                stackEmptyMsg.classList.remove('hidden');
            } else {
                stackEmptyMsg.classList.add('hidden');
                state.stack.forEach((val, idx) => {
                    const item = document.createElement('div');
                    // Style elements like 3D blocks
                    item.className = "w-full py-2 px-4 rounded-lg bg-gradient-to-r from-cyan-900 to-slate-900 border border-cyan-500/30 text-cyan-300 font-mono font-bold text-center text-xs flex justify-between items-center shadow-md relative";
                    
                    // Mark new item (at the top) to trigger animation
                    if (idx === state.stack.length - 1 && prevState && prevState.stack.length < state.stack.length) {
                        item.classList.add('stack-item-new');
                    }
                    
                    // Index label
                    const indexLabel = document.createElement('span');
                    indexLabel.className = "text-[9px] text-cyan-600 font-bold font-mono";
                    indexLabel.textContent = `[${idx}]`;
                    item.appendChild(indexLabel);

                    // Value
                    const valSpan = document.createElement('span');
                    valSpan.textContent = formatValue(val);
                    item.appendChild(valSpan);
                    
                    stackItemsContainer.appendChild(item);
                });
            }
        }
        
        // 2. Accumulator VM
        else if (currentArchitecture === 'accumulator') {
            accValueBox.textContent = formatValue(state.acc);
            
            // Bounce/Pulse ACC on change
            if (prevState && prevState.acc !== state.acc) {
                accValueBox.classList.remove('glow-emerald');
                accValueBox.classList.add('scale-105', 'border-emerald-400', 'text-white');
                setTimeout(() => {
                    accValueBox.classList.add('glow-emerald');
                    accValueBox.classList.remove('scale-105', 'border-emerald-400', 'text-white');
                }, 300);
            }
        }
        
        // 3. Register VM
        else if (currentArchitecture.startsWith('register')) {
            Object.keys(state.registers).forEach(reg => {
                const regSpan = document.getElementById(`reg-${reg}`);
                if (regSpan) {
                    const val = state.registers[reg];
                    regSpan.textContent = formatValue(val);
                    
                    // Highlight on change
                    if (prevState && prevState.registers[reg] !== val) {
                        const parent = regSpan.parentElement;
                        parent.classList.add('cell-updated', 'border-amber-500/50');
                        setTimeout(() => {
                            parent.classList.remove('cell-updated', 'border-amber-500/50');
                        }, 1200);
                    }
                }
            });
        }

        // 4. Memory / Variables Table
        renderMemoryTable(state.memory, prevState ? prevState.memory : null);

        // 5. Instruction Trace
        renderPCTrace();

        // Status bars
        pcStatus.textContent = `PC: ${state.pc}`;
        cycleStatus.textContent = `Ciclos: ${state.cycleCount}`;
    }

    function renderMemoryTable(memory, prevMemory) {
        memoryTableBody.innerHTML = '';
        const keys = Object.keys(memory).sort();
        
        if (keys.length === 0) {
            memoryTableBody.innerHTML = `
                <tr>
                    <td colspan="2" class="py-4 text-center text-slate-600 italic">No hay variables cargadas</td>
                </tr>
            `;
            return;
        }

        keys.forEach(key => {
            const val = memory[key];
            const row = document.createElement('tr');
            row.className = "hover:bg-slate-900/40 transition-colors";
            
            // Check if changed
            const isChanged = prevMemory && prevMemory[key] !== val;
            if (isChanged) {
                row.classList.add('cell-updated');
            }

            const keyTd = document.createElement('td');
            keyTd.className = "py-2 px-4 text-slate-400 font-bold font-mono";
            keyTd.textContent = key;

            const valTd = document.createElement('td');
            valTd.className = `py-2 px-4 text-right font-mono font-bold ${isChanged ? 'text-emerald-400' : 'text-slate-200'}`;
            valTd.textContent = formatValue(val);

            row.appendChild(keyTd);
            row.appendChild(valTd);
            memoryTableBody.appendChild(row);
        });
    }

    function renderPCTrace() {
        pcTraceContainer.innerHTML = '';
        
        if (simulator.instructions.length === 0) {
            pcTraceContainer.innerHTML = `
                <div class="text-center py-4 text-slate-600 italic">Carga código para ver traza</div>
            `;
            return;
        }

        simulator.instructions.forEach((inst, idx) => {
            const line = document.createElement('div');
            line.className = `p-1.5 rounded flex items-center justify-between transition-all leading-5 ${
                simulator.state.pc === idx 
                    ? 'pc-active-line text-violet-200 border-l-2 border-violet-500 font-semibold' 
                    : 'text-slate-500 hover:text-slate-400'
            }`;
            
            const leftDiv = document.createElement('div');
            leftDiv.className = "flex items-center space-x-2 font-mono text-xs";
            
            // PC index indicator
            const pcBadge = document.createElement('span');
            pcBadge.className = `text-[9px] font-mono px-1 rounded ${
                simulator.state.pc === idx ? 'bg-purple-900 text-purple-200' : 'bg-slate-900 text-slate-600'
            }`;
            pcBadge.textContent = String(idx).padStart(2, '0');
            leftDiv.appendChild(pcBadge);

            // Instruction code
            const codeSpan = document.createElement('span');
            codeSpan.textContent = inst.raw;
            leftDiv.appendChild(codeSpan);

            line.appendChild(leftDiv);
            
            // Original line label
            const lineLabel = document.createElement('span');
            lineLabel.className = "text-[9px] text-slate-700 font-mono";
            lineLabel.textContent = `L: ${inst.originalLineNum}`;
            line.appendChild(lineLabel);

            pcTraceContainer.appendChild(line);
        });
    }

    function formatValue(val) {
        if (val === undefined || val === null) return "0";
        // If float and has decimals, limit to 4 digits
        if (Number.isInteger(val)) {
            return String(val);
        }
        return Number(val.toFixed(4)).toString(); // strips trailing zeros
    }

    // ----------------------------------------------------
    // CONSOLE LOGGER
    // ----------------------------------------------------
    function logToConsole(msg, color = '') {
        const line = document.createElement('div');
        line.className = "font-mono text-xs leading-5 border-b border-slate-900/50 pb-1";
        
        if (color === 'red') {
            line.classList.add('text-red-400');
        } else if (color === 'emerald') {
            line.classList.add('text-emerald-400');
        } else if (color === 'cyan') {
            line.classList.add('text-cyan-400');
        } else if (color === 'violet') {
            line.classList.add('text-violet-400');
        } else if (color === 'yellow') {
            line.classList.add('text-yellow-500');
        } else {
            line.classList.add('text-slate-400');
        }

        const time = new Date().toLocaleTimeString();
        line.innerHTML = `<span class="text-slate-600 mr-2 font-mono text-[9px]">${time}</span> ${msg}`;
        consoleLog.appendChild(line);
        consoleLog.scrollTop = consoleLog.scrollHeight;
    }

    function logClear() {
        consoleLog.innerHTML = '';
    }

    function clearSyntaxErrors() {
        // We can just keep console as is or put a small trace.
    }

    // ----------------------------------------------------
    // EDITOR LINE NUMBERS & SYNCHRONIZATION
    // ----------------------------------------------------
    function syncLineNumbers() {
        const text = codeEditor.value;
        const lineCount = text.split('\n').length;
        
        let numbersHtml = '';
        for (let i = 1; i <= lineCount; i++) {
            numbersHtml += `<div>${i}</div>`;
        }
        editorLineNumbers.innerHTML = numbersHtml;
    }

    // Sync line numbering scroll with textarea scroll
    codeEditor.addEventListener('scroll', () => {
        editorLineNumbers.scrollTop = codeEditor.scrollTop;
    });

    // Handle keypresses (e.g. Tab insertion)
    codeEditor.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = codeEditor.selectionStart;
            const end = codeEditor.selectionEnd;
            const val = codeEditor.value;
            codeEditor.value = val.substring(0, start) + "    " + val.substring(end);
            codeEditor.selectionStart = codeEditor.selectionEnd = start + 4;
            syncLineNumbers();
            parseEditorCode();
        }
    });

    // Real-time compilation on change
    codeEditor.addEventListener('input', () => {
        syncLineNumbers();
        parseEditorCode();
    });

    // ----------------------------------------------------
    // BUTTON EVENT BINDINGS
    // ----------------------------------------------------
    btnSandbox.addEventListener('click', () => {
        loadSandbox(selectManualArch.value);
    });

    selectManualArch.addEventListener('change', (e) => {
        loadSandbox(e.target.value);
    });

    btnRun.addEventListener('click', runToCompletion);
    btnStep.addEventListener('click', stepForward);
    btnPrev.addEventListener('click', stepBackward);
    btnReset.addEventListener('click', resetVM);
    btnVerify.addEventListener('click', verifyExercise);

    btnClearConsole.addEventListener('click', logClear);

    // Division toggles
    btnDivFloat.addEventListener('click', () => {
        simulator.setDivisionMode('float');
        btnDivFloat.className = "px-2.5 py-0.5 rounded text-xs font-bold transition-all bg-violet-600 text-white shadow-sm shadow-violet-900/50";
        btnDivInt.className = "px-2.5 py-0.5 rounded text-xs font-bold text-slate-400 hover:text-slate-200 transition-all";
        logToConsole("Modo división cambiado a PUNTO FLOTANTE (Float).", "cyan");
        resetVM();
    });

    btnDivInt.addEventListener('click', () => {
        simulator.setDivisionMode('int');
        btnDivInt.className = "px-2.5 py-0.5 rounded text-xs font-bold transition-all bg-violet-600 text-white shadow-sm shadow-violet-900/50";
        btnDivFloat.className = "px-2.5 py-0.5 rounded text-xs font-bold text-slate-400 hover:text-slate-200 transition-all";
        logToConsole("Modo división cambiado a ENTERA (Integer, truncado).", "cyan");
        resetVM();
    });
});
