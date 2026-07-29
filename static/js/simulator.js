/**
 * AssemblerEasy - Simulator Engine
 * Contains the Parser and Virtual Machines for Stack, Accumulator, and Register Architectures.
 */

// Helper to determine if an operand is a register
function isRegister(op) {
    return /^R[0-7]$/i.test(op.trim());
}

// Helper to parse numeric values or return variables
function parseValue(valStr, state) {
    const trimmed = valStr.trim();
    // Check if immediate value (e.g. #10 or 10)
    if (trimmed.startsWith('#')) {
        return parseFloat(trimmed.slice(1));
    }
    const numVal = parseFloat(trimmed);
    if (!isNaN(numVal)) {
        return numVal;
    }
    
    // It's a variable or memory address
    if (isRegister(trimmed)) {
        const reg = trimmed.toUpperCase();
        return reg === 'R7' ? 0 : (state.registers[reg] || 0);
    }
    
    return state.memory[trimmed] !== undefined ? state.memory[trimmed] : 0;
}

// Helper to write values to memory or registers
function writeDestination(dest, value, state) {
    const trimmed = dest.trim();
    if (isRegister(trimmed)) {
        const reg = trimmed.toUpperCase();
        if (reg === 'R7') {
            // R7 is read-only, ignore writes
            return;
        }
        state.registers[reg] = value;
    } else {
        // Memory variable
        state.memory[trimmed] = value;
    }
}

class AssemblerSimulator {
    constructor() {
        this.instructions = [];
        this.labels = {};
        this.stateHistory = []; // For step back function
        this.divisionMode = 'float'; // 'float' or 'int'
        
        // Active VM state
        this.state = {
            pc: 0,
            stack: [],
            acc: 0,
            registers: {
                R0: 0, R1: 0, R2: 0, R3: 0, R4: 0, R5: 0, R6: 0, R7: 0
            },
            memory: {},
            status: 'idle', // 'idle', 'running', 'paused', 'halted', 'error'
            errorMsg: '',
            cycleCount: 0
        };
    }

    setDivisionMode(mode) {
        this.divisionMode = mode === 'int' ? 'int' : 'float';
    }

    divide(a, b) {
        if (b === 0) {
            throw new Error("División por cero");
        }
        if (this.divisionMode === 'int') {
            return Math.trunc(a / b);
        }
        return a / b;
    }

    /**
     * Parses the assembler code.
     * Returns an array of syntax errors, or empty array if code is clean.
     */
    parse(codeText, architecture) {
        this.instructions = [];
        this.labels = {};
        this.stateHistory = [];
        
        const errors = [];
        const lines = codeText.split('\n');
        
        let instructionIndex = 0;
        
        // First Pass: Clean, identify labels and map instructions
        const cleanLines = [];
        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            // Remove comments starting with ; or //
            let line = rawLine.split(';')[0].split('//')[0].trim();
            if (!line) continue; // Empty line
            
            // Check for labels (e.g. LOOP:)
            const labelMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:/);
            if (labelMatch) {
                const labelName = labelMatch[1].toUpperCase();
                if (this.labels[labelName] !== undefined) {
                    errors.push({ lineNum: i + 1, message: `Etiqueta duplicada: ${labelName}` });
                }
                this.labels[labelName] = instructionIndex;
                // Remove label prefix for instruction parsing
                line = line.substring(labelMatch[0].length).trim();
                if (!line) continue; // Only a label on this line
            }
            
            cleanLines.push({ text: line, originalLineNum: i + 1 });
            instructionIndex++;
        }
        
        // Second Pass: Parse instructions and operands
        for (let idx = 0; idx < cleanLines.length; idx++) {
            const { text, originalLineNum } = cleanLines[idx];
            
            // Split opcode and operands
            const firstSpace = text.indexOf(' ');
            let opcode, operandsStr;
            if (firstSpace === -1) {
                opcode = text.trim().toUpperCase();
                operandsStr = '';
            } else {
                opcode = text.substring(0, firstSpace).trim().toUpperCase();
                operandsStr = text.substring(firstSpace + 1).trim();
            }
            
            // Parse comma-separated operands
            const operands = operandsStr ? operandsStr.split(',').map(op => op.trim()) : [];
            
            // Validate instruction in context of selected architecture
            const validationError = this.validateInstruction(opcode, operands, architecture);
            if (validationError) {
                errors.push({ lineNum: originalLineNum, message: validationError });
            }
            
            this.instructions.push({
                opcode,
                operands,
                originalLineNum,
                raw: text
            });
        }
        
        // Deducir automáticamente las etiquetas implícitas 'THEN' y 'FIN' si no están declaradas
        if (this.labels['THEN'] === undefined || this.labels['FIN'] === undefined) {
            let botFinIdx = -1;
            let haltIdx = -1;
            
            for (let idx = 0; idx < this.instructions.length; idx++) {
                const inst = this.instructions[idx];
                if (inst.opcode === 'BOT' && inst.operands.length === 1) {
                    const dest = inst.operands[0].toUpperCase();
                    if (dest === 'FIN') {
                        botFinIdx = idx;
                    }
                }
                if (inst.opcode === 'HALT') {
                    haltIdx = idx;
                }
            }
            
            if (this.labels['THEN'] === undefined && botFinIdx !== -1) {
                this.labels['THEN'] = botFinIdx + 1;
            }
            if (this.labels['FIN'] === undefined) {
                this.labels['FIN'] = haltIdx !== -1 ? haltIdx : this.instructions.length;
            }
        }
        
        return errors;
    }

    /**
     * Validates an instruction against the target architecture specification.
     */
    validateInstruction(opcode, operands, architecture) {
        const opCount = operands.length;
        
        if (architecture === 'stack') {
            const allowed = ['PUSH', 'POP', 'PUSHC', 'ADD', 'SUB', 'MUL', 'DIV', 'TST', 'TSTZ', 'TSTN', 'BOT', 'JMP', 'HALT'];
            if (!allowed.includes(opcode)) {
                return `Instrucción no soportada en máquina de pila: ${opcode}`;
            }
            if (['PUSH', 'POP', 'PUSHC', 'BOT', 'JMP'].includes(opcode)) {
                if (opCount !== 1) return `La instrucción ${opcode} requiere exactamente 1 operando`;
            } else {
                if (opCount !== 0) return `La instrucción ${opcode} no lleva operandos`;
            }
        }
        
        else if (architecture === 'accumulator') {
            const allowed = ['LDA', 'STA', 'ADD', 'SUB', 'MUL', 'DIV', 'JMP', 'JZ', 'JN'];
            if (!allowed.includes(opcode)) {
                return `Instrucción no soportada en máquina de acumulador: ${opcode}`;
            }
            if (opCount !== 1) {
                return `La instrucción ${opcode} requiere exactamente 1 operando`;
            }
        }
        
        else if (architecture === 'register-2op') {
            const allowed = ['MOV', 'ADD', 'SUB', 'MUL', 'DIV'];
            if (!allowed.includes(opcode)) {
                return `Instrucción no soportada en máquina de registros 2-op: ${opcode}`;
            }
            if (opCount !== 2) {
                return `La instrucción ${opcode} requiere exactamente 2 operandos (Origen, Destino)`;
            }
        }
        
        else if (architecture === 'register-3op') {
            const allowed = ['MOV', 'ADD', 'SUB', 'MUL', 'DIV'];
            if (!allowed.includes(opcode)) {
                return `Instrucción no soportada en máquina de registros 3-op: ${opcode}`;
            }
            if (opcode === 'MOV') {
                if (opCount !== 2) return `La instrucción MOV requiere exactamente 2 operandos`;
            } else {
                if (opCount !== 3) return `La instrucción ${opcode} requiere exactamente 3 operandos`;
            }
        }
        
        else if (architecture === 'register-custom-9a') {
            if (opcode !== 'ADD') {
                return `La arquitectura limitada del Ejercicio 9a solo soporta la instrucción 'ADD'`;
            }
            if (opCount !== 3) {
                return `La instrucción ADD requiere exactamente 3 operandos en esta arquitectura`;
            }
            // Syntax: ADD Ri, X, Rj OR ADD Ri, Rj, X
            const op0_is_reg = isRegister(operands[0]);
            const op1_is_reg = isRegister(operands[1]);
            const op2_is_reg = isRegister(operands[2]);
            
            if (!op0_is_reg) {
                return `El primer operando debe ser un registro (R0-R7)`;
            }
            
            if (op1_is_reg && op2_is_reg) {
                return `Sintaxis inválida. Solo un operando puede ser memoria. Formatos válidos:\nADD Ri, X, Rj  o  ADD Ri, Rj, X`;
            }
            
            if (!op1_is_reg && !op2_is_reg) {
                return `Sintaxis inválida. Formatos válidos: ADD Ri, X, Rj  o  ADD Ri, Rj, X`;
            }
        }
        
        return null; // Valid
    }

    /**
     * Initializes VM state with initial variables and registers.
     */
    initVM(initialState) {
        this.state = {
            pc: 0,
            stack: initialState.stack ? [...initialState.stack] : [],
            acc: initialState.acc !== undefined ? initialState.acc : 0,
            registers: initialState.registers ? { ...initialState.registers } : {
                R0: 0, R1: 0, R2: 0, R3: 0, R4: 0, R5: 0, R6: 0, R7: 0
            },
            memory: initialState.memory ? { ...initialState.memory } : {},
            status: 'idle',
            errorMsg: '',
            cycleCount: 0
        };
        // Always force R7 to be 0
        this.state.registers.R7 = 0;
        this.stateHistory = [this.cloneState(this.state)];
    }

    /**
     * Clones the current VM state to save history.
     */
    cloneState(state) {
        return {
            pc: state.pc,
            stack: [...state.stack],
            acc: state.acc,
            registers: { ...state.registers },
            memory: { ...state.memory },
            status: state.status,
            errorMsg: state.errorMsg,
            cycleCount: state.cycleCount
        };
    }

    /**
     * Steps backward to the previous execution state.
     */
    stepBack() {
        if (this.stateHistory.length > 1) {
            this.stateHistory.pop(); // Remove current state
            this.state = this.cloneState(this.stateHistory[this.stateHistory.length - 1]);
            return true;
        }
        return false; // Already at the beginning
    }

    /**
     * Steps forward by executing the current instruction.
     */
    stepForward(architecture) {
        if (this.state.status === 'error' || this.state.status === 'halted') {
            return;
        }
        
        if (this.state.pc >= this.instructions.length) {
            this.state.status = 'halted';
            this.saveStateToHistory();
            return;
        }
        
        const inst = this.instructions[this.state.pc];
        this.state.status = 'running';
        
        try {
            this.executeInstruction(inst, architecture);
            this.state.cycleCount++;
            
            // Hardcode R7 to remain 0 in case it was written
            this.state.registers.R7 = 0;
            
            if (this.state.pc >= this.instructions.length && this.state.status !== 'error') {
                this.state.status = 'halted';
            }
            
            this.saveStateToHistory();
        } catch (e) {
            this.state.status = 'error';
            this.state.errorMsg = `Línea ${inst.originalLineNum}: ${e.message}`;
            this.saveStateToHistory();
        }
    }

    saveStateToHistory() {
        this.stateHistory.push(this.cloneState(this.state));
    }

    /**
     * Core CPU instruction executor.
     */
    executeInstruction(inst, architecture) {
        const { opcode, operands } = inst;
        
        if (architecture === 'stack') {
            this.executeStackInstruction(opcode, operands);
        } else if (architecture === 'accumulator') {
            this.executeAccumulatorInstruction(opcode, operands);
        } else if (architecture === 'register-2op') {
            this.executeRegister2OpInstruction(opcode, operands);
        } else if (architecture === 'register-3op') {
            this.executeRegister3OpInstruction(opcode, operands);
        } else if (architecture === 'register-custom-9a') {
            this.executeRegisterCustomInstruction(opcode, operands);
        }
    }

    // VM implementations

    executeStackInstruction(opcode, operands) {
        const mem = this.state.memory;
        const stack = this.state.stack;
        
        switch (opcode) {
            case 'PUSH': {
                const val = parseValue(operands[0], this.state);
                stack.push(val);
                this.state.pc++;
                break;
            }
            case 'PUSHC': {
                const val = parseFloat(operands[0]);
                if (isNaN(val)) throw new Error(`Constante inválida: ${operands[0]}`);
                stack.push(val);
                this.state.pc++;
                break;
            }
            case 'POP': {
                if (stack.length === 0) throw new Error("Pila vacía. No se puede hacer POP");
                const val = stack.pop();
                const dest = operands[0];
                mem[dest] = val;
                this.state.pc++;
                break;
            }
            case 'ADD': {
                if (stack.length < 2) throw new Error("Insuficientes elementos en pila para ADD");
                const b = stack.pop();
                const a = stack.pop();
                stack.push(a + b);
                this.state.pc++;
                break;
            }
            case 'SUB': {
                if (stack.length < 2) throw new Error("Insuficientes elementos en pila para SUB");
                const b = stack.pop();
                const a = stack.pop();
                stack.push(a - b);
                this.state.pc++;
                break;
            }
            case 'MUL': {
                if (stack.length < 2) throw new Error("Insuficientes elementos en pila para MUL");
                const b = stack.pop();
                const a = stack.pop();
                stack.push(a * b);
                this.state.pc++;
                break;
            }
            case 'DIV': {
                if (stack.length < 2) throw new Error("Insuficientes elementos en pila para DIV");
                const b = stack.pop();
                const a = stack.pop();
                stack.push(this.divide(a, b));
                this.state.pc++;
                break;
            }
            case 'TST':
            case 'TSTZ': {
                if (stack.length < 2) throw new Error(`Insuficientes elementos en pila para ${opcode}`);
                const b = stack.pop();
                const a = stack.pop();
                stack.push(a - b === 0 ? 1 : 0);
                this.state.pc++;
                break;
            }
            case 'TSTN': {
                if (stack.length < 2) throw new Error("Insuficientes elementos en pila para TSTN");
                const b = stack.pop();
                const a = stack.pop();
                stack.push(a - b < 0 ? 1 : 0);
                this.state.pc++;
                break;
            }
            case 'BOT': {
                if (stack.length === 0) throw new Error("Pila vacía. No se puede evaluar BOT");
                const condition = stack.pop();
                const label = operands[0].toUpperCase();
                if (this.labels[label] === undefined) throw new Error(`Etiqueta no encontrada: ${label}`);
                
                if (condition === 1) {
                    this.state.pc = this.labels[label];
                } else {
                    this.state.pc++;
                }
                break;
            }
            case 'JMP': {
                const label = operands[0].toUpperCase();
                if (this.labels[label] === undefined) throw new Error(`Etiqueta no encontrada: ${label}`);
                this.state.pc = this.labels[label];
                break;
            }
            case 'HALT': {
                this.state.status = 'halted';
                this.state.pc = this.instructions.length; // Ir al final
                break;
            }
            default:
                throw new Error(`Instrucción desconocida: ${opcode}`);
        }
    }

    executeAccumulatorInstruction(opcode, operands) {
        const val = parseValue(operands[0], this.state);
        const label = operands[0].toUpperCase();
        
        switch (opcode) {
            case 'LDA':
                this.state.acc = val;
                this.state.pc++;
                break;
            case 'STA':
                writeDestination(operands[0], this.state.acc, this.state);
                this.state.pc++;
                break;
            case 'ADD':
                this.state.acc = this.state.acc + val;
                this.state.pc++;
                break;
            case 'SUB':
                this.state.acc = this.state.acc - val;
                this.state.pc++;
                break;
            case 'MUL':
                this.state.acc = this.state.acc * val;
                this.state.pc++;
                break;
            case 'DIV':
                this.state.acc = this.divide(this.state.acc, val);
                this.state.pc++;
                break;
            case 'JMP':
                if (this.labels[label] === undefined) throw new Error(`Etiqueta no encontrada: ${label}`);
                this.state.pc = this.labels[label];
                break;
            case 'JZ':
                if (this.labels[label] === undefined) throw new Error(`Etiqueta no encontrada: ${label}`);
                if (this.state.acc === 0) {
                    this.state.pc = this.labels[label];
                } else {
                    this.state.pc++;
                }
                break;
            case 'JN':
                if (this.labels[label] === undefined) throw new Error(`Etiqueta no encontrada: ${label}`);
                if (this.state.acc < 0) {
                    this.state.pc = this.labels[label];
                } else {
                    this.state.pc++;
                }
                break;
            default:
                throw new Error(`Instrucción desconocida: ${opcode}`);
        }
    }

    executeRegister2OpInstruction(opcode, operands) {
        const src = operands[0];
        const dest = operands[1];
        
        const srcVal = parseValue(src, this.state);
        
        switch (opcode) {
            case 'MOV':
                writeDestination(dest, srcVal, this.state);
                this.state.pc++;
                break;
            case 'ADD': {
                const destVal = parseValue(dest, this.state);
                writeDestination(dest, srcVal + destVal, this.state);
                this.state.pc++;
                break;
            }
            case 'SUB': {
                const destVal = parseValue(dest, this.state);
                // PDF page 2 semantic: Y <- X - Y
                // X (src) - Y (dest) -> stored in Y (dest)
                writeDestination(dest, srcVal - destVal, this.state);
                this.state.pc++;
                break;
            }
            case 'MUL': {
                const destVal = parseValue(dest, this.state);
                writeDestination(dest, srcVal * destVal, this.state);
                this.state.pc++;
                break;
            }
            case 'DIV': {
                const destVal = parseValue(dest, this.state);
                writeDestination(dest, this.divide(srcVal, destVal), this.state);
                this.state.pc++;
                break;
            }
            default:
                throw new Error(`Instrucción desconocida: ${opcode}`);
        }
    }

    executeRegister3OpInstruction(opcode, operands) {
        if (opcode === 'MOV') {
            const srcVal = parseValue(operands[0], this.state);
            const dest = operands[1];
            writeDestination(dest, srcVal, this.state);
            this.state.pc++;
            return;
        }
        
        const src1 = operands[0];
        const src2 = operands[1];
        const dest = operands[2];
        
        const v1 = parseValue(src1, this.state);
        const v2 = parseValue(src2, this.state);
        
        switch (opcode) {
            case 'ADD':
                writeDestination(dest, v1 + v2, this.state);
                this.state.pc++;
                break;
            case 'SUB':
                writeDestination(dest, v1 - v2, this.state);
                this.state.pc++;
                break;
            case 'MUL':
                writeDestination(dest, v1 * v2, this.state);
                this.state.pc++;
                break;
            case 'DIV':
                writeDestination(dest, this.divide(v1, v2), this.state);
                this.state.pc++;
                break;
            default:
                throw new Error(`Instrucción desconocida: ${opcode}`);
        }
    }

    executeRegisterCustomInstruction(opcode, operands) {
        // Special Exercise 9a machine.
        // Valid Formats:
        // 1) ADD Ri, X, Rj  => Rj <- Ri + Mem[X]
        // 2) ADD Ri, Rj, X  => Mem[X] <- Ri + Rj
        
        const ri = operands[0];
        const op1 = operands[1];
        const op2 = operands[2];
        
        const riVal = parseValue(ri, this.state);
        
        if (isRegister(op1)) {
            // Case 2: ADD Ri, Rj, X => Mem[X] <- Ri + Rj
            const rjVal = parseValue(op1, this.state);
            const memAddress = op2; // e.g. "2600"
            
            const result = riVal + rjVal;
            this.state.memory[memAddress] = result;
        } else {
            // Case 1: ADD Ri, X, Rj => Rj <- Ri + Mem[X]
            const memAddress = op1; // e.g. "2400"
            const memVal = this.state.memory[memAddress] !== undefined ? this.state.memory[memAddress] : 0;
            const rj = op2;
            
            const result = riVal + memVal;
            writeDestination(rj, result, this.state);
        }
        
        this.state.pc++;
    }

    /**
     * Calculates the instruction length in bits based on the PDF specification.
     */
    calculateCodeSizeInBits(architecture) {
        let totalBits = 0;
        
        for (const inst of this.instructions) {
            const { opcode, operands } = inst;
            
            if (architecture === 'stack') {
                if (opcode === 'PUSHC') {
                    // PUSHC M has constant in it. PDF page 5 says 16 bits instruction.
                    totalBits += 16;
                } else if (['PUSH', 'POP', 'BOT', 'JMP'].includes(opcode)) {
                    // Memory direct address/labels (20 bits) + 8 bits opcode = 28 bits
                    totalBits += 28;
                } else {
                    // Arithmetic/TST without operands: 8 bits opcode only
                    totalBits += 8;
                }
            }
            
            else if (architecture === 'accumulator') {
                // All instruction have 1 memory operand (20 bits) + 8 bits opcode = 28 bits
                totalBits += 28;
            }
            
            else if (architecture === 'register-2op') {
                // Opcode (8 bits) + Op1 (var) + Op2 (var)
                // Register = 3 bits, Memory = 20 bits
                let instBits = 8;
                for (const op of operands) {
                    instBits += isRegister(op) ? 3 : 20;
                }
                totalBits += instBits;
            }
            
            else if (architecture === 'register-3op') {
                // MOV = 2 op, ADD/SUB/etc = 3 op
                let instBits = 8;
                if (opcode === 'MOV') {
                    for (const op of operands) {
                        instBits += isRegister(op) ? 3 : 20;
                    }
                } else {
                    for (const op of operands) {
                        instBits += isRegister(op) ? 3 : 20;
                    }
                }
                totalBits += instBits;
            }
            
            else if (architecture === 'register-custom-9a') {
                // ADD Ri, X, Rj  => Rj is reg(3), X is mem(20), Ri is reg(3), Op(8) = 34 bits
                // ADD Ri, Rj, X  => Ri is reg(3), Rj is reg(3), X is mem(20), Op(8) = 34 bits
                totalBits += 34;
            }
        }
        
        return totalBits;
    }
}

// Export for browser
window.AssemblerSimulator = AssemblerSimulator;
