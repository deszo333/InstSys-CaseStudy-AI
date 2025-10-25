// non_teaching_schedule_extractor.js
const xlsx = require('xlsx');
const fs = require('fs');

class NonTeachingScheduleExtractor {
  constructor() {
    this.dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  }

  /**
   * Main function to process non-teaching faculty schedule Excel file
   */
  async processNonTeachingScheduleExcel(filePath) {
    try {
      console.log(`\n📋 Processing non-teaching schedule file: ${filePath}`);
      
      // Read the Excel file
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to array of arrays for easier processing
      const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: null });
      
      console.log(`📋 Excel dimensions: ${data.length} rows x ${data[0]?.length || 0} columns`);
      
      // STEP 1: Extract staff name and department
      const staffInfo = this.extractStaffInfo(data);
      console.log(`📋 Staff Info:`, staffInfo);
      
      // STEP 2: Extract schedule data
      const scheduleData = this.extractScheduleData(data);
      console.log(`📋 Found ${scheduleData.length} scheduled shifts/duties`);
      
      // Format the output
      const result = {
        metadata: {
          staff_name: staffInfo.name,
          full_name: staffInfo.name,
          department: this.standardizeDepartment(staffInfo.department),
          position: staffInfo.position || 'Staff',
          data_type: 'non_teaching_faculty_schedule',
          faculty_type: 'non_teaching_schedule',
          total_shifts: scheduleData.length,
          days_working: this.countUniqueDays(scheduleData),
          source_file: filePath.split(/[/\\]/).pop(),
          created_at: new Date()
        },
        schedule_data: {
          schedule: scheduleData,
          by_day: this.organizeByDay(scheduleData)
        },
        formatted_text: this.formatScheduleText(staffInfo, scheduleData)
      };
      
      return result;
      
    } catch (error) {
      console.error(`❌ Error processing non-teaching schedule Excel: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract staff name and department from Excel
   */
  extractStaffInfo(data) {
    const staffInfo = {
      name: 'Unknown Staff',
      department: 'UNKNOWN',
      position: ''
    };
    
    // Search first 10 rows for staff information
    for (let i = 0; i < Math.min(10, data.length); i++) {
      const row = data[i];
      if (!row) continue;
      
      for (let j = 0; j < Math.min(10, row.length); j++) {
        if (!row[j]) continue;
        
        const cellValue = String(row[j]).trim();
        const cellUpper = cellValue.toUpperCase();
        
        // Look for staff name
        if (cellUpper.includes('NAME OF FACULTY') || 
            cellUpper.includes('FACULTY NAME') || 
            cellUpper.includes('NAME OF STAFF') ||
            cellUpper.includes('STAFF NAME') ||
            cellUpper.includes('NAME:')) {
          
          // Check next cells for the actual name
          for (let k = j + 1; k < Math.min(j + 4, row.length); k++) {
            if (row[k]) {
              const potentialName = String(row[k]).trim();
              if (potentialName.length > 2 && !['N/A', 'NA', ''].includes(potentialName.toUpperCase())) {
                staffInfo.name = this.toTitleCase(potentialName);
                console.log(`🎯 Found staff name: ${potentialName}`);
                break;
              }
            }
          }
        }
        
        // Look for department
        if (cellUpper.includes('DEPARTMENT:') || cellUpper.includes('DEPT:')) {
          // Check next cells for the department
          for (let k = j + 1; k < Math.min(j + 4, row.length); k++) {
            if (row[k]) {
              const potentialDept = String(row[k]).trim();
              if (potentialDept.length > 1 && !['N/A', 'NA', ''].includes(potentialDept.toUpperCase())) {
                staffInfo.department = potentialDept.toUpperCase();
                console.log(`🎯 Found department: ${potentialDept}`);
                break;
              }
            }
          }
        }
        
        // Look for position
        if (cellUpper.includes('POSITION:') || cellUpper.includes('TITLE:')) {
          for (let k = j + 1; k < Math.min(j + 4, row.length); k++) {
            if (row[k]) {
              const potentialPos = String(row[k]).trim();
              if (potentialPos.length > 2) {
                staffInfo.position = this.toTitleCase(potentialPos);
                console.log(`🎯 Found position: ${potentialPos}`);
                break;
              }
            }
          }
        }
      }
    }
    
    return staffInfo;
  }

  /**
   * Extract schedule data from Excel
   */
  extractScheduleData(data) {
    const scheduleData = [];
    
    // Find the schedule table headers
    let scheduleStartRow = -1;
    const dayColumns = {};
    let timeColumn = -1;
    
    const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY',
                  'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    
    // Search for header row
    for (let i = 0; i < Math.min(15, data.length); i++) {
      const row = data[i];
      if (!row) continue;
      
      const rowCells = row.map(cell => cell ? String(cell).toUpperCase().trim() : '');
      
      // Find TIME column
      rowCells.forEach((cell, j) => {
        if (cell.includes('TIME') && timeColumn === -1) {
          timeColumn = j;
          console.log(`🕐 Found TIME column at position ${j}`);
        }
        
        // Find day columns
        days.forEach(day => {
          if (cell.includes(day) && !dayColumns[j]) {
            dayColumns[j] = this.standardizeDayName(day);
            console.log(`📅 Found ${day} column at position ${j}`);
          }
        });
      });
      
      // If we found headers, next row is data start
      if (Object.keys(dayColumns).length >= 3 && timeColumn >= 0) {
        scheduleStartRow = i + 1;
        console.log(`🎯 Found schedule header at row ${i}, data starts at row ${scheduleStartRow}`);
        break;
      }
    }
    
    if (scheduleStartRow === -1) {
      console.log('⚠️  Could not find proper schedule table structure');
      return [];
    }
    
    console.log(`📋 Day columns mapping:`, dayColumns);
    console.log(`📋 Time column: ${timeColumn}`);
    
    // Find data end (stop at first row without valid time)
    let dataEndRow = data.length;
    for (let i = scheduleStartRow; i < data.length; i++) {
      if (!this.hasValidTime(data, i, timeColumn)) {
        dataEndRow = i;
        break;
      }
    }
    
    console.log(`📋 Data ends at row: ${dataEndRow}`);
    
    // Extract schedule entries
    Object.entries(dayColumns).forEach(([colIdx, day]) => {
      const col = parseInt(colIdx);
      console.log(`\n🔍 Processing ${day} column (index ${col}):`);
      
      for (let i = scheduleStartRow; i < dataEndRow; i++) {
        // Get time for this row
        let currentTime = null;
        if (timeColumn >= 0 && data[i] && data[i][timeColumn]) {
          const timeCell = String(data[i][timeColumn]).trim();
          if (timeCell && !['N/A', 'NONE', ''].includes(timeCell.toUpperCase())) {
            currentTime = timeCell;
          }
        }
        
        if (!currentTime) continue;
        
        // Check if this day column has an assignment
        if (data[i] && data[i][col]) {
          const assignmentCell = String(data[i][col]).trim();
          if (assignmentCell && !['N/A', 'NONE', ''].includes(assignmentCell.toUpperCase())) {
            const scheduleEntry = {
              day: day,
              time: currentTime,
              duty: assignmentCell.includes('Task:') ? assignmentCell : `Task: ${assignmentCell}`,
              assignment: assignmentCell,
              full_description: `${day} ${currentTime} - ${assignmentCell}`
            };
            
            scheduleData.push(scheduleEntry);
            console.log(`   Row ${i}: Found assignment '${assignmentCell}' at time ${currentTime}`);
          }
        }
      }
    });
    
    console.log(`📋 Total extracted assignments: ${scheduleData.length}`);
    return scheduleData;
  }

  /**
   * Check if row has valid time data
   */
  hasValidTime(data, rowIdx, timeColumn) {
    if (!data[rowIdx] || timeColumn < 0 || !data[rowIdx][timeColumn]) {
      return false;
    }
    
    const timeCell = String(data[rowIdx][timeColumn]).trim();
    if (!timeCell || ['N/A', 'NONE', ''].includes(timeCell.toUpperCase())) {
      return false;
    }
    
    // Check if it looks like a time (contains numbers, colon, or AM/PM)
    return /\d/.test(timeCell) || timeCell.includes(':') || /AM|PM/i.test(timeCell);
  }

  /**
   * Standardize day name
   */
  standardizeDayName(day) {
    const dayMap = {
      'MON': 'Monday',
      'MONDAY': 'Monday',
      'TUE': 'Tuesday',
      'TUESDAY': 'Tuesday',
      'WED': 'Wednesday',
      'WEDNESDAY': 'Wednesday',
      'THU': 'Thursday',
      'THURSDAY': 'Thursday',
      'FRI': 'Friday',
      'FRIDAY': 'Friday',
      'SAT': 'Saturday',
      'SATURDAY': 'Saturday',
      'SUN': 'Sunday',
      'SUNDAY': 'Sunday'
    };
    
    return dayMap[day.toUpperCase()] || day;
  }

  /**
   * Standardize department name
   */
  standardizeDepartment(dept) {
    if (!dept || dept === 'UNKNOWN') return 'UNKNOWN';
    
    const deptMap = {
      'REGISTRAR': 'REGISTRAR',
    'OFFICE OF THE REGISTRAR': 'REGISTRAR',
    'REGISTRAR OFFICE': 'REGISTRAR',
    'REGISTRATION': 'REGISTRAR',
    
    'LIBRARY': 'LIBRARY',
    'UNIVERSITY LIBRARY': 'LIBRARY',
    
    'FINANCE': 'FINANCE',
    'ACCOUNTING': 'FINANCE',
    'FINANCE OFFICE': 'FINANCE',
    'ACCOUNTING OFFICE': 'FINANCE',
    'TREASURY': 'FINANCE',
    
    'HR': 'HR',
    'HUMAN RESOURCES': 'HR',
    'HUMAN RESOURCE': 'HR',
    'PERSONNEL': 'HR',
    'HRD': 'HR',
    
    'ADMIN': 'ADMIN',
    'ADMINISTRATION': 'ADMIN',
    'ADMINISTRATIVE': 'ADMIN',
    'GENERAL SERVICES': 'ADMIN',
    
    'GUIDANCE': 'GUIDANCE',
    'GUIDANCE OFFICE': 'GUIDANCE',
    'COUNSELING': 'GUIDANCE',
    
    'CASHIER': 'CASHIER',
    'CASHIERING': 'CASHIER',
    
    'CLINIC': 'CLINIC',
    'MEDICAL': 'CLINIC',
    'HEALTH': 'CLINIC',
    'INFIRMARY': 'CLINIC',
    
    'SECURITY': 'SECURITY',
    'GUARD': 'SECURITY',
    
    'MAINTENANCE': 'MAINTENANCE',
    'FACILITIES': 'MAINTENANCE',
    'JANITORIAL': 'MAINTENANCE',
    
    'SCHOLARSHIP': 'SCHOLARSHIP',
    'STUDENT AFFAIRS': 'STUDENT_AFFAIRS',
    'STUDENT SERVICES': 'STUDENT_AFFAIRS',
    
    'SUPPLY': 'SUPPLY',
    'PROCUREMENT': 'SUPPLY',
    
    // Only if they work FOR an academic department (rare)
    'CCS': 'CCS_ADMIN',
    'CHTM': 'CHTM_ADMIN',
    'CBA': 'CBA_ADMIN',
    'CTE': 'CTE_ADMIN',
    'COE': 'COE_ADMIN',
    'CON': 'CON_ADMIN',
    'CAS': 'CAS_ADMIN'
  };
    
    const upper = dept.toUpperCase();
    
    for (const [key, value] of Object.entries(deptMap)) {
      if (upper.includes(key)) {
        return value;
      }
    }
    
    return dept.toUpperCase();
  }

  /**
   * Count unique days
   */
  countUniqueDays(scheduleData) {
    const uniqueDays = new Set();
    scheduleData.forEach(entry => {
      if (entry.day) uniqueDays.add(entry.day);
    });
    return uniqueDays.size;
  }

  /**
   * Organize schedule by day
   */
  organizeByDay(scheduleData) {
    const byDay = {};
    
    scheduleData.forEach(entry => {
      const day = entry.day || 'Unknown';
      if (!byDay[day]) {
        byDay[day] = [];
      }
      byDay[day].push(entry);
    });
    
    // Sort each day's schedule by time
    Object.keys(byDay).forEach(day => {
      byDay[day].sort((a, b) => this.compareTime(a.time, b.time));
    });
    
    return byDay;
  }

  /**
   * Compare times for sorting
   */
  compareTime(timeA, timeB) {
    // Simple time comparison (works for most formats)
    const parseTime = (time) => {
      if (!time) return 0;
      
      const str = time.toUpperCase();
      let hours = 0;
      let minutes = 0;
      
      // Extract hours and minutes
      const match = str.match(/(\d+):?(\d*)/);
      if (match) {
        hours = parseInt(match[1]);
        minutes = match[2] ? parseInt(match[2]) : 0;
      }
      
      // Handle AM/PM
      if (str.includes('PM') && hours !== 12) {
        hours += 12;
      } else if (str.includes('AM') && hours === 12) {
        hours = 0;
      }
      
      return hours * 60 + minutes;
    };
    
    return parseTime(timeA) - parseTime(timeB);
  }

  /**
   * Format schedule as readable text
   */
  formatScheduleText(staffInfo, scheduleData) {
    let text = '='.repeat(60) + '\n';
    text += 'NON-TEACHING FACULTY WORK SCHEDULE\n';
    text += '='.repeat(60) + '\n\n';
    
    text += 'STAFF INFORMATION:\n';
    text += `  Name: ${staffInfo.name}\n`;
    text += `  Department: ${staffInfo.department}\n`;
    if (staffInfo.position) {
      text += `  Position: ${staffInfo.position}\n`;
    }
    text += '\n';
    
    text += `WEEKLY WORK SCHEDULE (${scheduleData.length} scheduled assignments):\n`;
    text += '-'.repeat(60) + '\n\n';
    
    if (scheduleData.length > 0) {
      const byDay = this.organizeByDay(scheduleData);
      
      // Display in day order
      this.dayOrder.forEach(day => {
        if (byDay[day] && byDay[day].length > 0) {
          text += `${day.toUpperCase()}:\n`;
          
          byDay[day].forEach(entry => {
            text += `  • ${entry.time.padEnd(15)} - ${entry.assignment}\n`;
          });
          
          text += '\n';
        }
      });
    } else {
      text += '  No scheduled duties found.\n';
    }
    
    return text;
  }

  /**
   * Convert to title case
   */
  toTitleCase(str) {
    return str.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
}

module.exports = NonTeachingScheduleExtractor;