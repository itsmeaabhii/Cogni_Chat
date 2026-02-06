// --- Set up the connection to our backend API ---
const API_URL = "https://cogni-chat.onrender.com";

// --- Get references to all the HTML elements ---
const ingestButton = document.getElementById('ingest-button');
const queryButton = document.getElementById('query-button');

const sourceNameInput = document.getElementById('source-name');
const textInput = document.getElementById('text-input');
const queryInput = document.getElementById('query-input');

const resultsCard = document.getElementById('results-card');
const loadingSpinner = document.getElementById('loading-spinner');
const resultsPlaceholder = document.getElementById('results-placeholder');

const answerContainer = document.getElementById('answer-container');
const answerText = document.getElementById('answer-text');
const sourcesContainer = document.getElementById('sources-container');
const sourcesList = document.getElementById('sources-list');

const toast = document.getElementById('toast');


// --- Attach functions to our button clicks ---
ingestButton.addEventListener('click', handleIngest);
queryButton.addEventListener('click', handleQuery);

// --- Add keyboard shortcuts ---
// Ctrl+Enter (or Cmd+Enter on Mac) to submit in the ingest textarea
textInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleIngest();
    }
});

// Ctrl+Enter (or Cmd+Enter on Mac) or just Enter to submit query
queryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        handleQuery();
    }
});


// --- Main Handler Functions ---

/**
 * Handles the "Ingest Document" button click.
 */
async function handleIngest() {
    const sourceName = sourceNameInput.value.trim();
    const text = textInput.value.trim();

    if (!sourceName || !text) {
        showToast('Please provide both a document name and text.', 'error');
        return;
    }

    resetResultsUI();
    setLoadingState(true);

    try {
        const response = await fetch(`${API_URL}/ingest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source_name: sourceName, text: text })
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.detail || 'Failed to ingest data.');
        }
        
        showToast(result.message, 'success');
        // The lines that cleared the inputs have been removed.

    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        setLoadingState(false);
    }
}

/**
 * Handles the "Get Answer" button click.
 */
async function handleQuery() {
    const query = queryInput.value.trim();

    if (!query) {
        showToast('Please enter a question to ask.', 'error');
        return;
    }

    resetResultsUI();
    setLoadingState(true);

    try {
        const startTime = Date.now(); // Start timer
        const response = await fetch(`${API_URL}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query })
        });
        
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.detail || 'Failed to get an answer.');
        }

        const endTime = Date.now(); // End timer
        const duration = ((endTime - startTime) / 1000).toFixed(2); // Calculate duration in seconds

        displayResults(result, duration);

    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        setLoadingState(false);
    }
}


// --- UI Helper Functions ---

/**
 * Manages the loading state (spinner, disabled buttons).
 */
function setLoadingState(isLoading) {
    loadingSpinner.classList.toggle('hidden', !isLoading);
    ingestButton.disabled = isLoading;
    queryButton.disabled = isLoading;
}

/**
 * Hides all result sections and shows the placeholder.
 */
function resetResultsUI() {
    resultsPlaceholder.classList.remove('hidden');
    answerContainer.classList.add('hidden');
    sourcesContainer.classList.add('hidden');
    answerText.textContent = '';
    sourcesList.innerHTML = '';
}

/**
 * Renders the successful query result on the page.
 */
function displayResults(data, duration) {
    resultsPlaceholder.classList.add('hidden');
    
    // 1. Find all citation numbers (e.g., [1], [2]) in the answer text.
    const citationRegex = /\[(\d+)\]/g;
    const matches = [...data.answer.matchAll(citationRegex)];
    const citedIds = matches.map(match => parseInt(match[1]));
    const uniqueCitedIds = [...new Set(citedIds)]; // Keep only unique numbers.

    // Display the answer and add timing info
    answerText.textContent = data.answer;
    const timingElement = document.createElement('small');
    timingElement.textContent = `(Answer generated in ${duration} seconds)`;
    timingElement.style.display = 'block';
    timingElement.style.marginTop = '1rem';
    timingElement.style.opacity = '0.7';
    answerText.appendChild(timingElement);
    
    answerContainer.classList.remove('hidden');

    // 2. Filter the sources to only include the ones that were actually cited.
    const citedSources = data.sources.filter(source => uniqueCitedIds.includes(source.id));

    // 3. Only show the sources container if there are any cited sources.
    if (citedSources.length > 0) {
        citedSources.forEach(source => {
            const sourceElement = document.createElement('div');
            sourceElement.classList.add('source-item');
            sourceElement.innerHTML = `<strong>Source [${source.id}]:</strong><p>${source.text}</p>`;
            sourcesList.appendChild(sourceElement);
        });
        sourcesContainer.classList.remove('hidden');
    }
}

/**
 * Shows a toast notification at the bottom of the screen.
 */
function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = ''; // Reset classes
    toast.classList.add(type, 'show');

    // Hide the toast after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

