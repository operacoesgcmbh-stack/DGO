// API Base URL (Google Apps Script Web App /exec)
const API_URL = "https://script.google.com/macros/s/AKfycbzhBn37yWrbeB5_lh7oboNFrEHqBJqoDNShcemNUuovt9CIQagefV_uP5utaUSNz66X/exec";

// State
let buscarData = [];
let indeferimentoData = [];

// DOM Elements
const form = document.getElementById('formBuscar');
const tableBody = document.getElementById('tableBody');
const resultSection = document.getElementById('resultSection');
const resultContent = document.getElementById('resultContent');
const searchTable = document.getElementById('searchTable');
const refreshBtn = document.getElementById('refreshData');
const modal = document.getElementById('modal');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    setupEventListeners();
});

function setupEventListeners() {
    // Form submission
    form.addEventListener('submit', handleFormSubmit);

    // Calculate days automatically
    document.getElementById('dataInicio').addEventListener('change', calculateDays);
    document.getElementById('dataTermino').addEventListener('change', calculateDays);

    // Search filter
    searchTable.addEventListener('input', filterTable);

    // Refresh data
    refreshBtn.addEventListener('click', loadData);

    // Modal close
    const closeBtn = document.querySelector('.close');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}

function parseAnyDate(value) {
    if (!value) return null;

    // Excel serial
    if (typeof value === 'number') {
        const dt = new Date((value - 25569) * 86400 * 1000);
        return isNaN(dt.getTime()) ? null : dt;
    }

    const str = String(value).trim();
    if (!str) return null;

    // yyyy-mm-dd (input type="date")
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

function calculateDays() {
    const inicio = document.getElementById('dataInicio').value;
    const termino = document.getElementById('dataTermino').value;

    const startDate = parseAnyDate(inicio);
    const endDate = parseAnyDate(termino);

    if (startDate && endDate) {
        const diffTime = Math.abs(endDate - startDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        document.getElementById('diasCorridos').value = diffDays;
    }
}

async function loadData() {
    try {
        tableBody.innerHTML = '<tr><td colspan="9" class="empty-state">Carregando dados...</td></tr>';

        // 1) Dados principais
        const res = await fetch(`${API_URL}?action=list`);
        const data = await res.json();
        buscarData = Array.isArray(data) ? data : [];

        // 2) Indeferimentos (opcional)
        const resInd = await fetch(`${API_URL}?action=indeferimentos`);
        const ind = await resInd.json();
        indeferimentoData = Array.isArray(ind) ? ind : [];

        renderTable(buscarData);
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        tableBody.innerHTML = '<tr><td colspan="9" class="empty-state">Erro ao carregar dados. Tente novamente.</td></tr>';
    }
}

function renderTable(data) {
    if (!Array.isArray(data) || data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="9" class="empty-state">Nenhum dado encontrado</td></tr>';
        return;
    }

    tableBody.innerHTML = data.map((row) => {
        const isIndeferido = checkIndeferimento(row.bm);
        return `
            <tr>
                <td><strong>${row.bm || ''}</strong></td>
                <td>${row.nome || ''}</td>
                <td><span class="badge badge-pending">${row.status || ''}</span></td>
                <td>${row.divisao || ''}</td>
                <td>${formatDate(row.dataInicio)}</td>
                <td>${formatDate(row.dataTermino)}</td>
                <td>${row.diasCorridos || ''}</td>
                <td>${row.tipoLicenca || ''}</td>
                <td>
                    <button class="btn btn-small btn-secondary" onclick="viewDetails('${row.id}')">Ver</button>
                    <button class="btn btn-small btn-danger" onclick="deleteEntry('${row.id}')">Excluir</button>
                </td>
            </tr>
        `;
    }).join('');
}

function checkIndeferimento(bm) {
    if (!bm) return false;
    const normalizedBM = bm.toString().trim().toUpperCase();
    return indeferimentoData.some(item => {
        const itemBM = (item.bm || '').toString().trim().toUpperCase();
        return itemBM === normalizedBM && String(item.indeferimento || '').toUpperCase() === 'SIM';
    });
}

function formatDate(dateValue) {
    if (!dateValue) return '';

    // If it's already a string date yyyy-mm-dd
    if (typeof dateValue === 'string' && dateValue.includes('-')) {
        const [year, month, day] = dateValue.split('-');
        return `${day}/${month}/${year}`;
    }

    // If it's an Excel date number
    if (typeof dateValue === 'number') {
        const date = new Date((dateValue - 25569) * 86400 * 1000);
        return date.toLocaleDateString('pt-BR');
    }

    // dd/mm/yyyy
    if (typeof dateValue === 'string' && dateValue.includes('/')) {
        return dateValue;
    }

    return String(dateValue);
}

async function handleFormSubmit(e) {
    e.preventDefault();

    const btnText = document.querySelector('.btn-text');
    const btnLoading = document.querySelector('.btn-loading');
    const submitBtn = form.querySelector('button[type="submit"]');

    // Show loading state
    if (btnText) btnText.style.display = 'none';
    if (btnLoading) btnLoading.style.display = 'inline';
    submitBtn.disabled = true;

    const formData = {
        bm: document.getElementById('bm').value.trim(),
        nome: document.getElementById('nome').value.trim(),
        status: document.getElementById('status').value,
        divisao: document.getElementById('divisao').value,
        dataInicio: document.getElementById('dataInicio').value,
        dataTermino: document.getElementById('dataTermino').value,
        diasCorridos: document.getElementById('diasCorridos').value,
        tipoLicenca: document.getElementById('tipoLicenca').value
    };

    try {
        // Add record via Apps Script
        const addResponse = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'add', record: formData })
        });

        const addResult = await addResponse.json();

        if (!addResult.ok) {
            alert('Erro ao adicionar dados: ' + (addResult.error || 'Erro desconhecido'));
            return;
        }

        // Check indeferimento locally
        const isIndeferido = checkIndeferimento(formData.bm);
        const indeferimentoInfo = indeferimentoData.find(x =>
            String(x.bm || '').trim().toUpperCase() === String(formData.bm).trim().toUpperCase()
        ) || null;

        showResult(formData, { indeferido: isIndeferido, info: indeferimentoInfo });

        // Reload table
        await loadData();

        // Reset form
        form.reset();
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro ao processar solicitação. Tente novamente.');
    } finally {
        if (btnText) btnText.style.display = 'inline';
        if (btnLoading) btnLoading.style.display = 'none';
        submitBtn.disabled = false;
    }
}

function showResult(formData, checkResult) {
    resultSection.style.display = 'block';

    const isIndeferido = !!checkResult.indeferido;
    const indeferimentoInfo = checkResult.info;

    let resultHTML = '';

    if (isIndeferido) {
        resultHTML = `
            <div class="result-card danger">
                <h4>⚠️ BM com Indeferimento Anterior</h4>
                <p><strong>BM:</strong> ${formData.bm}</p>
                <p><strong>Nome:</strong> ${formData.nome}</p>
                <p>Este BM possui histórico de indeferimento anterior.</p>
                ${indeferimentoInfo ? `
                    <p><strong>Data de Nascimento:</strong> ${formatExcelDate(indeferimentoInfo.dataNascimento)}</p>
                    <p><strong>Data de Efetivação:</strong> ${formatExcelDate(indeferimentoInfo.efetivacao)}</p>
                ` : ''}
                <p style="margin-top: 1rem;">
                    Este registro terá <strong>prioridade alta</strong> na página de resultados.
                </p>
            </div>
        `;
    } else {
        resultHTML = `
            <div class="result-card success">
                <h4>✓ BM Sem Indeferimento Anterior</h4>
                <p><strong>BM:</strong> ${formData.bm}</p>
                <p><strong>Nome:</strong> ${formData.nome}</p>
                <p>Este BM não possui histórico de indeferimento anterior.</p>
            </div>
        `;
    }

    resultContent.innerHTML = resultHTML;

    // Scroll to result
    resultSection.scrollIntoView({ behavior: 'smooth' });
}

function formatExcelDate(dateValue) {
    if (!dateValue || dateValue === ' ') return 'Não informado';
    if (typeof dateValue === 'number') {
        const date = new Date((dateValue - 25569) * 86400 * 1000);
        return date.toLocaleDateString('pt-BR');
    }
    return String(dateValue);
}

function filterTable() {
    const searchTerm = searchTable.value.toLowerCase();
    const filteredData = buscarData.filter(row => {
        return Object.values(row).some(val =>
            String(val).toLowerCase().includes(searchTerm)
        );
    });
    renderTable(filteredData);
}

function viewDetails(id) {
    const item = buscarData.find(x => String(x.id) === String(id));
    if (!item) return;

    const isIndeferido = checkIndeferimento(item.bm);

    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    modalTitle.textContent = `Detalhes - ${item.bm}`;
    modalBody.innerHTML = `
        <div style="display: grid; gap: 0.8rem;">
            <p><strong>BM:</strong> ${item.bm}</p>
            <p><strong>Nome:</strong> ${item.nome}</p>
            <p><strong>Status:</strong> ${item.status}</p>
            <p><strong>Divisão:</strong> ${item.divisao || 'Não informado'}</p>
            <p><strong>Data Início:</strong> ${formatDate(item.dataInicio)}</p>
            <p><strong>Data Término:</strong> ${formatDate(item.dataTermino)}</p>
            <p><strong>Dias Corridos:</strong> ${item.diasCorridos}</p>
            <p><strong>Tipo de Licença:</strong> ${item.tipoLicenca}</p>
            <p><strong>Indeferimento Anterior:</strong>
                <span class="badge ${isIndeferido ? 'badge-indeferido' : 'badge-nao-indeferido'}">
                    ${isIndeferido ? 'SIM' : 'NÃO'}
                </span>
            </p>
        </div>
    `;

    modal.style.display = 'flex';
}

async function deleteEntry(id) {
    if (!confirm('Tem certeza que deseja excluir este registro?')) return;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'delete', id })
        });

        const result = await response.json();

        if (result.ok) {
            await loadData();
        } else {
            alert('Erro ao excluir: ' + (result.error || 'Erro desconhecido'));
        }
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro ao excluir. Tente novamente.');
    }
}

function closeModal() {
    modal.style.display = 'none';
}
