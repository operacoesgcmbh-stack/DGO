// API Base URL (Google Apps Script Web App /exec)
const API_URL = "https://script.google.com/macros/s/AKfycbzhBn37yWrbeB5_lh7oboNFrEHqBJqoDNShcemNUuovt9CIQagefV_uP5utaUSNz66X/exec";

// State
let classifiedData = [];
let originalData = [];

// DOM Elements
const resultsBody = document.getElementById('resultsBody');
const searchResults = document.getElementById('searchResults');
const filterIndeferimento = document.getElementById('filterIndeferimento');
const refreshBtn = document.getElementById('refreshResults');
const exportBtn = document.getElementById('exportCSV');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadClassifiedData();
    setupEventListeners();
});

function setupEventListeners() {
    searchResults.addEventListener('input', filterResults);
    filterIndeferimento.addEventListener('change', filterResults);
    refreshBtn.addEventListener('click', loadClassifiedData);
    exportBtn.addEventListener('click', exportToCSV);
}

function parseAnyDate(value) {
    if (!value && value !== 0) return null;

    // Excel serial
    if (typeof value === 'number') {
        const dt = new Date((value - 25569) * 86400 * 1000);
        return isNaN(dt.getTime()) ? null : dt;
    }

    const str = String(value).trim();
    if (!str) return null;

    // yyyy-mm-dd
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        const [y, m, d] = str.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        return isNaN(dt.getTime()) ? null : dt;
    }

    // dd/mm/yyyy
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
        const [d, m, y] = str.split('/').map(Number);
        const dt = new Date(y, m - 1, d);
        return isNaN(dt.getTime()) ? null : dt;
    }

    const dt = new Date(str);
    return isNaN(dt.getTime()) ? null : dt;
}

function calcAge(birthDate) {
    const dt = parseAnyDate(birthDate);
    if (!dt) return null;
    const today = new Date();
    let age = today.getFullYear() - dt.getFullYear();
    const m = today.getMonth() - dt.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dt.getDate())) age--;
    return age;
}

async function loadClassifiedData() {
    try {
        resultsBody.innerHTML = '<tr><td colspan="11" class="empty-state">Carregando e classificando dados...</td></tr>';

        // 1) Dados principais
        const res = await fetch(`${API_URL}?action=list`);
        const buscar = await res.json();
        const buscarData = Array.isArray(buscar) ? buscar : [];

        // 2) Indeferimentos
        const resInd = await fetch(`${API_URL}?action=indeferimentos`);
        const ind = await resInd.json();
        const indeferimentoData = Array.isArray(ind) ? ind : [];

        // Mapa de indeferimentos por BM
        const indeferMap = new Map(
            indeferimentoData.map(i => [String(i.bm || '').trim().toUpperCase(), i])
        );

        // Enriquecer registros
        const enriched = buscarData.map(row => {
            const key = String(row.bm || '').trim().toUpperCase();
            const info = indeferMap.get(key) || null;

            const indeferido = !!(info && String(info.indeferimento || '').toUpperCase() === 'SIM');
            const efetivacao = info ? info.efetivacao : null;
            const dataNascimento = info ? info.dataNascimento : null;
            const idade = calcAge(dataNascimento);

            return {
                ...row,
                indeferido,
                efetivacao,
                dataNascimento,
                idade
            };
        });

        // Classificação (seguindo os critérios do resultados.html):
        // 1) Indeferimento (SIM primeiro)
        // 2) Data de efetivação mais antiga (asc)
        // 3) Maior idade (data de nascimento mais antiga => asc)
        // 4) BM como desempate
        enriched.sort((a, b) => {
            const ai = a.indeferido ? 1 : 0;
            const bi = b.indeferido ? 1 : 0;
            if (ai !== bi) return bi - ai; // indeferido primeiro

            const da = parseAnyDate(a.efetivacao);
            const db = parseAnyDate(b.efetivacao);
            const ta = da ? da.getTime() : Number.POSITIVE_INFINITY;
            const tb = db ? db.getTime() : Number.POSITIVE_INFINITY;
            if (ta !== tb) return ta - tb; // mais antigo primeiro

            const ba = parseAnyDate(a.dataNascimento);
            const bb = parseAnyDate(b.dataNascimento);
            const na = ba ? ba.getTime() : Number.POSITIVE_INFINITY;
            const nb = bb ? bb.getTime() : Number.POSITIVE_INFINITY;
            if (na !== nb) return na - nb; // mais antigo primeiro

            return String(a.bm || '').localeCompare(String(b.bm || ''), 'pt-BR');
        });

        classifiedData = enriched;
        originalData = [...classifiedData];

        // Stats
        const total = originalData.length;
        const indeferidos = originalData.filter(r => r.indeferido).length;
        const naoIndeferidos = total - indeferidos;

        updateStats({ total, indeferidos, naoIndeferidos });
        renderResults(classifiedData);
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        resultsBody.innerHTML = '<tr><td colspan="11" class="empty-state">Erro ao carregar dados. Tente novamente.</td></tr>';
    }
}

function updateStats(stats) {
    document.getElementById('totalRegistros').textContent = stats?.total || 0;
    document.getElementById('totalIndeferidos').textContent = stats?.indeferidos || 0;
    document.getElementById('totalNaoIndeferidos').textContent = stats?.naoIndeferidos || 0;
}

function renderResults(data) {
    if (!Array.isArray(data) || data.length === 0) {
        resultsBody.innerHTML = '<tr><td colspan="11" class="empty-state">Nenhum registro encontrado</td></tr>';
        return;
    }

    resultsBody.innerHTML = data.map((row, index) => {
        const isIndeferido = !!row.indeferido;
        const positionClass = index < 10 ? 'top-10' : index < 30 ? 'top-30' : '';

        return `
            <tr>
                <td>
                    <div class="classification-indicator">
                        <span class="classification-number ${positionClass}">${index + 1}</span>
                    </div>
                </td>
                <td><strong>${row.bm || ''}</strong></td>
                <td>${row.nome || ''}</td>
                <td><span class="badge badge-pending">${row.status || ''}</span></td>
                <td>${formatDate(row.dataInicio)}</td>
                <td>${formatDate(row.dataTermino)}</td>
                <td>${row.diasCorridos || ''}</td>
                <td>
                    <span class="badge ${isIndeferido ? 'badge-indeferido' : 'badge-nao-indeferido'}">
                        ${isIndeferido ? 'SIM' : 'NÃO'}
                    </span>
                </td>
                <td>${formatExcelDate(row.efetivacao)}</td>
                <td>${formatExcelDate(row.dataNascimento)}</td>
                <td>${row.idade !== null && row.idade !== undefined ? row.idade + ' anos' : '-'}</td>
            </tr>
        `;
    }).join('');
}

function formatDate(dateValue) {
    if (!dateValue) return '-';

    if (typeof dateValue === 'string' && dateValue.includes('-')) {
        const [year, month, day] = dateValue.split('-');
        return `${day}/${month}/${year}`;
    }
    if (typeof dateValue === 'number') {
        const date = new Date((dateValue - 25569) * 86400 * 1000);
        return date.toLocaleDateString('pt-BR');
    }
    return String(dateValue);
}

function formatExcelDate(dateValue) {
    if (!dateValue && dateValue !== 0) return '-';
    if (typeof dateValue === 'number') {
        const date = new Date((dateValue - 25569) * 86400 * 1000);
        return date.toLocaleDateString('pt-BR');
    }
    // yyyy-mm-dd -> dd/mm/yyyy
    if (typeof dateValue === 'string' && dateValue.includes('-')) {
        const [y, m, d] = dateValue.split('-');
        return `${d}/${m}/${y}`;
    }
    return String(dateValue);
}

function filterResults() {
    const searchTerm = searchResults.value.toLowerCase();
    const indeferidoFilter = filterIndeferimento.value;

    let filteredData = [...originalData];

    // Filter by search term
    if (searchTerm) {
        filteredData = filteredData.filter(row =>
            Object.values(row).some(val =>
                String(val).toLowerCase().includes(searchTerm)
            )
        );
    }

    // Filter by indeferimento
    if (indeferidoFilter !== 'all') {
        filteredData = filteredData.filter(row =>
            indeferidoFilter === 'sim' ? row.indeferido : !row.indeferido
        );
    }

    renderResults(filteredData);
}

function exportToCSV() {
    if (!originalData.length) {
        alert('Nenhum dado para exportar.');
        return;
    }

    const headers = [
        'Posição', 'BM', 'Nome', 'Status', 'Data Início', 'Data Término', 'Dias Corridos',
        'Indeferimento', 'Efetivação', 'Data Nascimento', 'Idade'
    ];

    const rows = originalData.map((row, idx) => ([
        idx + 1,
        row.bm || '',
        row.nome || '',
        row.status || '',
        formatDate(row.dataInicio),
        formatDate(row.dataTermino),
        row.diasCorridos || '',
        row.indeferido ? 'SIM' : 'NÃO',
        formatExcelDate(row.efetivacao),
        formatExcelDate(row.dataNascimento),
        row.idade !== null && row.idade !== undefined ? row.idade : ''
    ]));

    const csvContent = [
        headers.join(';'),
        ...rows.map(r => r.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(';'))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `classificacao_licenca_premio_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
