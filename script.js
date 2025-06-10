let headers = [];
let columnOptions = [];
let uploadedFile = null;
let selectedColumns = new Set(); // 선택된 컬럼을 추적
let columnDataTypes = new Map(); // 컬럼별 데이터 타입 저장
let columnDateFormats = new Map(); // 컬럼별 날짜 형식 저장
let tableName = ''; // 테이블 이름 전역 변수 추가

// 기본 제공 컬럼 옵션
const defaultColumns = [
    {
        column: 'ID',
        value: "'TEST'|| TO_CHAR(SYSDATE,'YYYYMMDD') || LPAD(TEST_SEQ.NEXTVAL, 8,'0')",
        valueType: 'query',
        checked: true
    },
    {
        column: 'USG_YN',
        value: "Y",
        valueType: 'string',
        checked: false
    },
    {
        column: 'DEL_YN',
        value: "N",
        valueType: 'string',
        checked: false
    },
    {
        column: 'CRT_USR_ID',
        value: "ADMIN",
        valueType: 'string',
        checked: true
    },
    {
        column: 'CRT_DT',
        value: "TO_CHAR(SYSDATE, 'YYYYMMDDHH24MISS')",
        valueType: 'query',
        checked: true
    },
    {
        column: 'UPT_USR_ID',
        value: "ADMIN",
        valueType: 'string',
        checked: true
    },
    {
        column: 'UPT_DT',
        value: "TO_CHAR(SYSDATE, 'YYYYMMDDHH24MISS')",
        valueType: 'query',
        checked: true
    }
];

// 페이지 로드 시 초기 validation 체크
document.addEventListener('DOMContentLoaded', function() {
    validateInputs();
});

// 파일 선택 이벤트 리스너
document.getElementById('fileInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        uploadedFile = file;
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {
                type: 'array',
                codepage: 65001,
                cellDates: true,
                cellNF: false,
                cellText: false
            });
            
            // 첫 번째 시트의 데이터 읽기
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet, {
                header: 1,
                defval: null,
                blankrows: false,
                raw: false,
                dateNF: 'yyyy-mm-dd'  // 날짜 형식 지정
            });
            
            // 헤더 추출
            headers = jsonData[0].filter(header => header); // 빈 헤더 제거
            
            // 컬럼 선택 UI 업데이트
            updateColumnSelectionUI();
            
            // 파일 정보 표시
            document.getElementById('fileInfo').textContent = `파일명: ${file.name}`;
            
            // validation 체크
            validateInputs();
        };
        
        reader.readAsArrayBuffer(file);
    } else {
        // 파일이 선택되지 않은 경우 validation 체크
        validateInputs();
    }
});

// 테이블 이름 입력 이벤트 리스너
document.getElementById('tableName').addEventListener('input', function(e) {
    tableName = e.target.value.trim();
    validateInputs();
});

function validateInputs() {
    const fileInput = document.getElementById('fileInput');
    const startButton = document.getElementById('startButton');
    const validationMessage = document.getElementById('validationMessage');
    
    let isValid = true;
    let message = [];
    
    // 파일 업로드 체크
    if (!fileInput.files.length) {
        isValid = false;
        message.push('엑셀 파일을 업로드해주세요.');
    }
    
    // 테이블 이름 체크
    if (!tableName) {
        isValid = false;
        message.push('테이블 이름을 입력해주세요.');
    }
    
    // 선택된 컬럼 체크 (헤더가 있는 경우에만)
    if (headers && headers.length > 0 && selectedColumns.size === 0) {
        isValid = false;
        message.push('최소 하나 이상의 컬럼을 선택해주세요.');
    }
    
    // validation 메시지 업데이트
    if (!isValid) {
        validationMessage.className = 'validation-message error';
        validationMessage.innerHTML = message.join('<br>');
        validationMessage.style.display = 'block';
    } else {
        validationMessage.style.display = 'none';
    }
    
    // 버튼 활성화/비활성화
    startButton.disabled = !isValid;
}

function startProcessing() {
    if (!uploadedFile || !tableName) {
        const validationMessage = document.getElementById('validationMessage');
        validationMessage.className = 'validation-message error';
        validationMessage.textContent = '파일과 테이블 이름을 모두 입력해주세요.';
        validationMessage.style.display = 'block';
        return;
    }

    // 결과 영역 초기화
    const resultDiv = document.getElementById('result');
    resultDiv.innerHTML = '';
    
    // 복사 버튼 비활성화
    const copyButton = document.getElementById('copyButton');
    copyButton.disabled = true;

    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {
            type: 'array',
            codepage: 65001,
            cellDates: true,  // 날짜를 Date 객체로 변환
            cellNF: false,
            cellText: false
        });

        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, {
            header: 1,
            defval: null,
            blankrows: false,
            raw: false,
            dateNF: 'yyyy-mm-dd'  // 날짜 형식 지정
        });

        // 선택된 컬럼만 처리
        const selectedHeaders = Array.from(selectedColumns);
        const headerIndexes = selectedHeaders.map(header => headers.indexOf(header));
        
        let sqlQueries = [];
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            const values = headerIndexes.map((index, idx) => {
                const value = row[index];
                const header = selectedHeaders[idx];
                return formatValue(value, header);
            });
            
            // 기본 제공 컬럼 처리
            const checkedDefaultColumns = defaultColumns.filter(col => col.checked);
            const defaultColumnValues = checkedDefaultColumns.map(col => {
                if (col.valueType === 'query') {
                    return col.value; // SQL 쿼리는 그대로 사용
                } else {
                    return formatColumnValue(col.value, col.valueType);
                }
            });

            // 사용자가 추가한 컬럼 처리
            const userColumnValues = columnOptions.map(col => {
                if (col.valueType === 'query') {
                    return col.value; // SQL 쿼리는 그대로 사용
                } else {
                    return formatColumnValue(col.value, col.valueType);
                }
            });
            
            const allValues = [...values, ...defaultColumnValues, ...userColumnValues];
            const allColumns = [
                ...selectedHeaders,
                ...checkedDefaultColumns.map(col => col.column),
                ...columnOptions.map(col => col.column)
            ];
            
            const query = `INSERT INTO ${tableName} (${allColumns.join(', ')}) VALUES (${allValues.join(', ')});`;
            sqlQueries.push(convertSqlKeywordsToUpperCase(query));
        }

        resultDiv.innerHTML = sqlQueries.join('<br>');
        copyButton.disabled = false;
    };

    reader.readAsArrayBuffer(uploadedFile);
}

function convertSqlKeywordsToUpperCase(query) {
    // SQL 키워드 목록
    const keywords = [
        'INSERT', 'INTO', 'VALUES', 'SELECT', 'FROM', 'WHERE', 'AND', 'OR',
        'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'ALTER', 'DROP',
        'TO_CHAR', 'SYSDATE', 'NEXTVAL', 'LPAD'
    ];
    
    let result = query;
    keywords.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        result = result.replace(regex, keyword);
    });
    
    return result;
}

function formatColumnValue(value, valueType) {
    if (!value) return 'NULL';
    
    switch (valueType) {
        case 'query':
            return value; // SQL 쿼리는 그대로 반환
        case 'string':
            return `'${value.replace(/'/g, "''")}'`;
        case 'number':
            return isNaN(value) ? 'NULL' : value;
        case 'date':
            const dateFormat = columnDateFormats.get(value) || 'YYYYMMDD';
            return `TO_CHAR(${value}, '${dateFormat}')`;
        default:
            return `'${value.replace(/'/g, "''")}'`;
    }
}

function formatValue(value, columnName) {
    if (value === null || value === undefined || value === '') {
        return 'NULL';
    }
    
    const dataType = columnDataTypes.get(columnName) || 'string';
    
    switch (dataType) {
        case 'number':
            return isNaN(value) ? 'NULL' : value;
        case 'date':
            const dateFormat = columnDateFormats.get(columnName) || 'YYYYMMDD';
            return formatDateValue(value, dateFormat);
        default:
            return typeof value === 'string' ? `'${value.replace(/'/g, "''")}'` : value;
    }
}

function addColumnOption() {
    const columnOptionsDiv = document.getElementById('columnOptions');
    const optionDiv = document.createElement('div');
    optionDiv.className = 'column-option';
    
    const columnInput = document.createElement('input');
    columnInput.type = 'text';
    columnInput.className = 'column-input';
    columnInput.placeholder = '컬럼명 입력';
    columnInput.style.width = '150px';

    const typeSelect = document.createElement('select');
    typeSelect.className = 'value-type-select';
    const types = [
        {value: 'string', text: '일반 문자열'},
        {value: 'query', text: 'SQL 쿼리'}
    ];
    types.forEach(type => {
        const option = document.createElement('option');
        option.value = type.value;
        option.textContent = type.text;
        typeSelect.appendChild(option);
    });

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'value-input';
    valueInput.placeholder = '값 또는 SQL 입력';
    valueInput.style.width = '300px';

    const removeButton = document.createElement('button');
    removeButton.textContent = '삭제';
    removeButton.onclick = function() {
        columnOptionsDiv.removeChild(optionDiv);
        updateColumnOptionsArray();
    };

    // 입력값 변경 이벤트 추가
    columnInput.addEventListener('change', updateColumnOptionsArray);
    typeSelect.addEventListener('change', updateColumnOptionsArray);
    valueInput.addEventListener('change', updateColumnOptionsArray);

    optionDiv.appendChild(columnInput);
    optionDiv.appendChild(typeSelect);
    optionDiv.appendChild(valueInput);
    optionDiv.appendChild(removeButton);
    
    columnOptionsDiv.appendChild(optionDiv);
    updateColumnOptionsArray();
}

function updateColumnOptionsArray() {
    columnOptions = [];
    const options = document.querySelectorAll('#columnOptions .column-option');
    options.forEach(option => {
        const column = option.querySelector('.column-input').value;
        const valueType = option.querySelector('.value-type-select').value;
        const value = option.querySelector('.value-input').value;

        if (column.trim() !== '' && value.trim() !== '') {
            columnOptions.push({
                column,
                valueType,
                value
            });
        }
    });
    console.log('Updated columnOptions:', columnOptions); // 디버깅용 로그
}

function copyToClipboard() {
    const resultDiv = document.getElementById('result');
    const text = resultDiv.innerText;
    
    navigator.clipboard.writeText(text).then(() => {
        const copyButton = document.getElementById('copyButton');
        const originalText = copyButton.textContent;
        copyButton.textContent = '복사 완료!';
        copyButton.disabled = true;
        
        setTimeout(() => {
            copyButton.textContent = originalText;
            copyButton.disabled = false;
        }, 2000);
    }).catch(err => {
        console.error('클립보드 복사 실패:', err);
        alert('클립보드 복사에 실패했습니다.');
    });
}

// 페이지 로드 시 기본 컬럼 옵션 UI 생성
document.addEventListener('DOMContentLoaded', function() {
    const defaultColumnsDiv = document.createElement('div');
    defaultColumnsDiv.className = 'default-columns';
    defaultColumnsDiv.innerHTML = '<h3>기본 제공 컬럼</h3>';
    
    defaultColumns.forEach(col => {
        const div = document.createElement('div');
        div.className = 'default-column-option';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = col.checked;
        checkbox.onchange = function() {
            col.checked = this.checked;
        };
        
        const columnInput = document.createElement('input');
        columnInput.type = 'text';
        columnInput.value = col.column;
        columnInput.onchange = function() {
            col.column = this.value;
        };
        
        const valueInput = document.createElement('input');
        valueInput.type = 'text';
        valueInput.value = col.value;
        valueInput.style.width = '400px';
        valueInput.onchange = function() {
            col.value = this.value;
        };
        
        div.appendChild(checkbox);
        div.appendChild(columnInput);
        div.appendChild(valueInput);
        defaultColumnsDiv.appendChild(div);
    });
    
    document.querySelector('.special-columns').insertBefore(
        defaultColumnsDiv,
        document.querySelector('.special-columns').firstChild
    );
});

// 컬럼 선택 UI 업데이트 함수 수정
function updateColumnSelectionUI() {
    const columnSelection = document.querySelector('.column-selection');
    const columnList = document.querySelector('.column-list');
    
    // 컬럼 선택 섹션 표시
    columnSelection.style.display = 'block';
    columnList.innerHTML = '';
    
    // 전체 선택 체크박스 추가
    const selectAllDiv = document.createElement('div');
    selectAllDiv.className = 'select-all';
    
    const selectAllCheckbox = document.createElement('input');
    selectAllCheckbox.type = 'checkbox';
    selectAllCheckbox.id = 'selectAllColumns';
    selectAllCheckbox.checked = true;
    selectAllCheckbox.addEventListener('change', function() {
        const checkboxes = columnList.querySelectorAll('input[type="checkbox"]:not(#selectAllColumns)');
        checkboxes.forEach(checkbox => {
            checkbox.checked = this.checked;
            if (this.checked) {
                selectedColumns.add(checkbox.value);
            } else {
                selectedColumns.delete(checkbox.value);
            }
        });
        validateInputs();
    });
    
    const selectAllLabel = document.createElement('label');
    selectAllLabel.htmlFor = 'selectAllColumns';
    selectAllLabel.textContent = '전체 선택';
    
    selectAllDiv.appendChild(selectAllCheckbox);
    selectAllDiv.appendChild(selectAllLabel);
    columnList.appendChild(selectAllDiv);
    
    // 선택된 컬럼 초기화
    selectedColumns.clear();
    
    // 각 컬럼에 대한 UI 추가
    headers.forEach(header => {
        if (header) {
            const columnDiv = document.createElement('div');
            columnDiv.className = 'column-option';
            
            // 체크박스
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `column-${header}`;
            checkbox.value = header;
            checkbox.checked = true;
            checkbox.addEventListener('change', function() {
                if (this.checked) {
                    selectedColumns.add(this.value);
                } else {
                    selectedColumns.delete(this.value);
                }
                updateSelectAllCheckbox();
                validateInputs();
            });
            
            // 라벨
            const label = document.createElement('label');
            label.htmlFor = `column-${header}`;
            label.textContent = header;
            
            // 데이터 타입 선택
            const typeSelect = document.createElement('select');
            typeSelect.className = 'data-type-select';
            ['string', 'number', 'date'].forEach(type => {
                const option = document.createElement('option');
                option.value = type;
                option.textContent = type;
                typeSelect.appendChild(option);
            });
            
            // 날짜 형식 선택 드롭다운
            const dateFormatSelect = document.createElement('select');
            dateFormatSelect.className = 'date-format-select';
            dateFormatSelect.style.display = 'none';
            
            // 날짜 형식 옵션 추가
    const dateFormats = [
        { value: 'YYYYMMDD', text: 'YYYYMMDD (예: 20250611)' },
        { value: 'YYMMDD', text: 'YYMMDD (예: 250611)' },
        { value: 'YYYY-MM-DD', text: 'YYYY-MM-DD (예: 2025-06-11)' },
        { value: 'YY-MM-DD', text: 'YY-MM-DD (예: 25-06-11)' }
    ];
    
    dateFormats.forEach(format => {
        const option = document.createElement('option');
        option.value = format.value;
        option.textContent = format.text;
        dateFormatSelect.appendChild(option);
    });
            
            // 데이터 타입 변경 이벤트
            typeSelect.addEventListener('change', function() {
                columnDataTypes.set(header, this.value);
                if (this.value === 'date') {
                    dateFormatSelect.style.display = 'inline-block';
                    columnDateFormats.set(header, dateFormatSelect.value);
                } else {
                    dateFormatSelect.style.display = 'none';
                }
            });
            
            // 날짜 형식 변경 이벤트
            dateFormatSelect.addEventListener('change', function() {
                columnDateFormats.set(header, this.value);
            });
            
            columnDiv.appendChild(checkbox);
            columnDiv.appendChild(label);
            columnDiv.appendChild(typeSelect);
            columnDiv.appendChild(dateFormatSelect);
            columnList.appendChild(columnDiv);
            
            // 초기 선택 상태 설정
            selectedColumns.add(header);
            
            // 초기 데이터 타입 설정
            const initialType = columnDataTypes.get(header) || 'string';
            typeSelect.value = initialType;
            if (initialType === 'date') {
                dateFormatSelect.style.display = 'inline-block';
                columnDateFormats.set(header, dateFormatSelect.value);
            }
        }
    });
    
    // 초기 validation 체크
    validateInputs();
}

// 전체 선택 체크박스 상태 업데이트 함수
function updateSelectAllCheckbox() {
    const selectAllCheckbox = document.getElementById('selectAllColumns');
    const checkboxes = document.querySelectorAll('.column-list input[type="checkbox"]:not(#selectAllColumns)');
    const allChecked = Array.from(checkboxes).every(checkbox => checkbox.checked);
    selectAllCheckbox.checked = allChecked;
}

// 데이터 타입 감지 함수
function detectDataType(values) {
    if (values.length === 0) return 'string';
    
    let hasNumber = false;
    let hasDate = false;
    let hasString = false;
    
    for (const value of values) {
        if (value === null || value === undefined || value === '') continue;
        
        // 숫자 체크
        if (!isNaN(value) && value !== '') {
            hasNumber = true;
        }
        
        // 날짜 체크 (YYYY-MM-DD, YYYY/MM/DD, YYYYMMDD 등)
        const datePattern = /^\d{4}[-/]?\d{2}[-/]?\d{2}$/;
        if (datePattern.test(value)) {
            hasDate = true;
        }
        
        // 문자열 체크
        if (typeof value === 'string' && value !== '') {
            hasString = true;
        }
    }
    
    // 우선순위: 날짜 > 숫자 > 문자열
    if (hasDate) return 'date';
    if (hasNumber) return 'number';
    return 'string';
}

// 날짜 형식 변환 함수
function formatDateValue(value, format) {
    if (!value) return 'NULL';
    
    // 기본 날짜 형식이 없는 경우 YYYYMMDD로 설정
    if (!format) format = 'YYYYMMDD';
    
    try {
        let date;
        // 문자열로 된 날짜 처리
        if (typeof value === 'string') {
            // YYYY-MM-DD 형식
            if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
                date = new Date(value);
            }
            // YYYY/MM/DD 형식
            else if (/^\d{4}\/\d{2}\/\d{2}$/.test(value)) {
                date = new Date(value);
            }
            // YYYYMMDD 형식
            else if (/^\d{8}$/.test(value)) {
                const year = value.substring(0, 4);
                const month = value.substring(4, 6);
                const day = value.substring(6, 8);
                date = new Date(`${year}-${month}-${day}`);
            }
            // MM/DD/YY 또는 MM/DD/YYYY 형식
            else if (value.includes('/')) {
                const parts = value.split('/');
                if (parts.length === 3) {
                    const month = parts[0];
                    const day = parts[1];
                    const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
                    date = new Date(`${year}-${month}-${day}`);
                }
            }
        }
        // Date 객체 처리
        else if (value instanceof Date) {
            date = value;
        }
        // Excel 숫자 형식 처리
        else if (typeof value === 'number') {
            date = new Date((value - 25569) * 86400 * 1000);
        }

        if (!date || isNaN(date.getTime())) return 'NULL';

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        
        // 사용자 지정 형식에 따라 변환
        return format
            .replace('YYYY', year)
            .replace('YY', String(year).slice(-2))
            .replace('MM', month)
            .replace('DD', day);
    } catch (e) {
        console.error('Date formatting error:', e);
        return 'NULL';
    }
} 