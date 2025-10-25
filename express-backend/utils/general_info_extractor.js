const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class GeneralInfoExtractor {
  constructor() {
    this.supportedTypes = ['mission_vision', 'objectives', 'history', 'core_values', 'hymn'];
  }

  /**
   * Main function to process General Info PDF file
   */
  async processGeneralInfoPDF(filePath) {
    try {
      console.log(`\n📄 Processing general info PDF: ${filePath}`);
      
      const fileName = path.basename(filePath, path.extname(filePath));
      const infoType = this.detectInfoType(fileName);
      
      console.log(`   Type detected: ${infoType}`);
      
      // Extract text from PDF
      const text = await this.extractTextFromPDF(filePath);
      
      if (!text || text.trim().length === 0) {
        console.log('❌ Could not extract text from PDF');
        return null;
      }
      
      console.log(`   Extracted ${text.length} characters`);
      
      // Parse based on type
      let parsedInfo;
      if (infoType === 'mission_vision') {
        parsedInfo = this.parseMissionVision(text);
      } else if (infoType === 'objectives') {
        parsedInfo = this.parseObjectives(text);
      } else if (infoType === 'history') {
        parsedInfo = this.parseHistory(text);
      } else if (infoType === 'core_values') {
        parsedInfo = this.parseCoreValues(text);
      } else if (infoType === 'hymn') {
        parsedInfo = this.parseHymn(text);
      } else {
        parsedInfo = { content: text };
      }
      
      // Build result
      const result = {
        metadata: {
          info_type: infoType,
          source_file: path.basename(filePath),
          data_type: 'general_info_pdf',
          extracted_at: new Date(),
          character_count: text.length
        },
        content: parsedInfo,
        raw_text: text,
        formatted_text: this.formatGeneralInfo(infoType, parsedInfo)
      };
      
      console.log(`✅ Extracted ${infoType} from PDF`);
      return result;
      
    } catch (error) {
      console.error(`❌ Error processing PDF: ${error.message}`);
      return null;
    }
  }

  /**
   * Detect the type of information from filename
   */
  detectInfoType(fileName) {
    // Remove special characters, spaces, underscores, dashes
    const lower = fileName.toLowerCase().replace(/[_\s\-&]/g, '');
    
    // Check for mission/vision (most common)
    if (lower.includes('mission') || lower.includes('vision') || lower.includes('missio')) {
      return 'mission_vision';
    } 
    // Check for objectives
    else if (lower.includes('objective') || lower.includes('object')) {
      return 'objectives';
    } 
    // Check for history
    else if (lower.includes('history') || lower.includes('background') || lower.includes('histor')) {
      return 'history';
    } 
    // Check for core values
    else if (lower.includes('corevalue') || lower.includes('value') || lower.includes('core')) {
      return 'core_values';
    } 
    // Check for hymn
    else if (lower.includes('hymn') || lower.includes('song') || lower.includes('anthem')) {
      return 'hymn';
    }
    
    return 'general';
  }

  /**
   * Extract text from PDF using pdf-parse
   */
  async extractTextFromPDF(filePath) {
    try {
      // Use pdf-parse npm package (version 1.1.1)
      const pdf = require('pdf-parse');
      const dataBuffer = await fs.readFile(filePath);
      
      // pdf-parse v1.1.1 exports a function directly
      const data = await pdf(dataBuffer);
      return data.text;
    } catch (error) {
      // Check if pdf-parse is installed
      if (error.code === 'MODULE_NOT_FOUND') {
        console.error('❌ pdf-parse module not found. Please install it:');
        console.error('   npm install pdf-parse@1.1.1');
        return '';
      }
      
      console.error('PDF extraction failed:', error.message);
      console.error('   Make sure you have pdf-parse@1.1.1 installed:');
      console.error('   npm install pdf-parse@1.1.1');
      return '';
    }
  }

  /**
   * Parse Mission and Vision
   */
  parseMissionVision(text) {
    const result = {
      vision: '',
      mission: ''
    };
    
    // Clean text
    const cleanText = text.replace(/\r\n/g, '\n').replace(/\n+/g, '\n');
    const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    let currentSection = null;
    let visionLines = [];
    let missionLines = [];
    
    for (const line of lines) {
      const upper = line.toUpperCase();
      
      // Check for section headers - must be standalone or at start of line
      // Use word boundaries to avoid matching "provision" as "vision"
      if (/^VISION\b/i.test(line) || /\bVISION\s*$/i.test(line)) {
        currentSection = 'vision';
        continue;
      } else if (/^MISSION\b/i.test(line) || /\bMISSION\s*$/i.test(line)) {
        currentSection = 'mission';
        continue;
      }
      
      if (currentSection === 'vision' && line.length > 10) {
        visionLines.push(line);
      } else if (currentSection === 'mission' && line.length > 10) {
        missionLines.push(line);
      }
    }
    
    result.vision = visionLines.join(' ').trim();
    result.mission = missionLines.join(' ').trim();
    
    return result;
  }

  /**
   * Parse Objectives
   */
  parseObjectives(text) {
    const result = {
      objectives: []
    };
    
    // Clean text
    const cleanText = text.replace(/\r\n/g, '\n').replace(/\n+/g, '\n');
    const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    let isObjectiveSection = false;
    let currentObjective = '';
    
    for (const line of lines) {
      const upper = line.toUpperCase();
      
      // Check if we're in objectives section
      if (upper.includes('OBJECTIVE')) {
        isObjectiveSection = true;
        continue;
      }
      
      if (isObjectiveSection && line.length > 10) {
        // Check if this starts a new objective (often starts with capital or bullet)
        if (this.startsNewObjective(line)) {
          if (currentObjective) {
            result.objectives.push(currentObjective.trim());
          }
          currentObjective = line;
        } else {
          // Continue current objective
          currentObjective += ' ' + line;
        }
      }
    }
    
    // Add last objective
    if (currentObjective) {
      result.objectives.push(currentObjective.trim());
    }
    
    return result;
  }

  /**
   * Check if line starts a new objective
   */
  startsNewObjective(line) {
    // Check for bullet points, numbers, or capital letter start
    const trimmed = line.trim();
    
    // Starts with bullet or dash
    if (/^[•\-\*●○]/.test(trimmed)) return true;
    
    // Starts with number followed by period or parenthesis
    if (/^\d+[\.\)]/.test(trimmed)) return true;
    
    // Starts with capital letter and is likely a sentence
    if (/^[A-Z]/.test(trimmed) && trimmed.length > 20) return true;
    
    return false;
  }

  /**
   * Parse History
   */
  parseHistory(text) {
    return {
      history: text.trim()
    };
  }

  /**
   * Parse Core Values
   */
  parseCoreValues(text) {
    const result = {
      core_values: []
    };
    
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    let isCoreValuesSection = false;
    
    for (const line of lines) {
      const upper = line.toUpperCase();
      
      if (upper.includes('CORE VALUE') || upper.includes('VALUES')) {
        isCoreValuesSection = true;
        continue;
      }
      
      if (isCoreValuesSection && line.length > 3) {
        result.core_values.push(line);
      }
    }
    
    return result;
  }

  /**
   * Parse Hymn
   */
  parseHymn(text) {
    return {
      hymn: text.trim()
    };
  }

  /**
   * Format general info as readable text
   */
  formatGeneralInfo(infoType, parsedInfo) {
    let formatted = '='.repeat(60) + '\n';
    
    if (infoType === 'mission_vision') {
      formatted += 'MISSION AND VISION\n';
      formatted += '='.repeat(60) + '\n\n';
      
      if (parsedInfo.vision) {
        formatted += 'VISION:\n';
        formatted += parsedInfo.vision + '\n\n';
      }
      
      if (parsedInfo.mission) {
        formatted += 'MISSION:\n';
        formatted += parsedInfo.mission + '\n';
      }
      
    } else if (infoType === 'objectives') {
      formatted += 'OBJECTIVES\n';
      formatted += '='.repeat(60) + '\n\n';
      
      parsedInfo.objectives.forEach((obj, index) => {
        formatted += `${index + 1}. ${obj}\n\n`;
      });
      
    } else if (infoType === 'history') {
      formatted += 'INSTITUTIONAL HISTORY\n';
      formatted += '='.repeat(60) + '\n\n';
      formatted += parsedInfo.history + '\n';
      
    } else if (infoType === 'core_values') {
      formatted += 'CORE VALUES\n';
      formatted += '='.repeat(60) + '\n\n';
      
      parsedInfo.core_values.forEach((value, index) => {
        formatted += `${index + 1}. ${value}\n`;
      });
      
    } else if (infoType === 'hymn') {
      formatted += 'INSTITUTIONAL HYMN\n';
      formatted += '='.repeat(60) + '\n\n';
      formatted += parsedInfo.hymn + '\n';
      
    } else {
      formatted += 'GENERAL INFORMATION\n';
      formatted += '='.repeat(60) + '\n\n';
      formatted += parsedInfo.content + '\n';
    }
    
    return formatted;
  }

  /**
   * Process all PDFs in a folder
   */
  async processFolder(folderPath) {
    try {
      const files = await fs.readdir(folderPath);
      const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));
      
      console.log(`\n📁 Found ${pdfFiles.length} PDF file(s) in general_info folder`);
      
      const results = [];
      
      for (const file of pdfFiles) {
        const filePath = path.join(folderPath, file);
        const result = await this.processGeneralInfoPDF(filePath);
        
        if (result) {
          results.push(result);
        }
      }
      
      return results;
      
    } catch (error) {
      console.error(`Error processing folder: ${error.message}`);
      return [];
    }
  }
}

module.exports = GeneralInfoExtractor;