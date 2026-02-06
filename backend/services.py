import os
import google.generativeai as genai
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pinecone import Pinecone
import cohere

# Import our settings from the config.py file
from config import settings

# --- INITIALIZE AI SERVICES ---

genai.configure(api_key=settings.GOOGLE_API_KEY)
pc = Pinecone(api_key=settings.PINECONE_API_KEY)
co = cohere.Client(settings.COHERE_API_KEY)

# --- GLOBAL VARIABLES ---

index_name = settings.PINECONE_INDEX_NAME
index = pc.Index(index_name)

embeddings_model = GoogleGenerativeAIEmbeddings(
    model="models/embedding-001", google_api_key=settings.GOOGLE_API_KEY
)

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=150
)

llm = genai.GenerativeModel('gemini-1.5-flash')


# --- INGESTION LOGIC ---
def ingest_text_data(source_name: str, text: str):
    print(f"Starting ingestion for source: {source_name}...")
    chunks = text_splitter.split_text(text)
    print(f"Text split into {len(chunks)} chunks.")
    vectors = embeddings_model.embed_documents(chunks)
    print("Created embeddings for all chunks.")
    pinecone_vectors = []
    for i, (chunk, vector) in enumerate(zip(chunks, vectors)):
        pinecone_vectors.append({
            "id": f"{source_name}-{i}",
            "values": vector,
            "metadata": {"text": chunk, "source": source_name}
        })
    index.upsert(vectors=pinecone_vectors, batch_size=100, namespace="default")
    print("Successfully upserted vectors to Pinecone.")
    return


# --- QUERY LOGIC (WITH THE FINAL FIX) ---
def process_query(query: str):
    print(f"Processing query: '{query}'")
    query_vector = embeddings_model.embed_query(query)
    print("Query embedding created.")
    
    retrieved_results = index.query(
        vector=query_vector,
        top_k=5,
        include_metadata=True,
        namespace="default"
    )
    retrieved_docs = [match['metadata']['text'] for match in retrieved_results['matches']]
    print(f"Retrieved {len(retrieved_docs)} documents from Pinecone.")

    reranked_response = co.rerank(
        query=query,
        documents=retrieved_docs,
        top_n=3,
        model="rerank-english-v3.0"
    )
    print("Reranked documents with Cohere.")

    context_for_llm = ""
    sources_for_response = []

    # --- THIS IS THE FINAL CORRECTION ---
    # The Cohere response gives us the reranked order. We use the 'index' from each result
    # to pick the actual text from our original 'retrieved_docs' list.
    for i, result in enumerate(reranked_response.results):
        doc_text = retrieved_docs[result.index]
        context_for_llm += f"[{i+1}] {doc_text}\n"
        sources_for_response.append({
            "id": i + 1,
            "text": doc_text
        })
    # ------------------------------------

    prompt = f"""
    You are an expert Q&A system that is trusted for its accuracy and truthfulness.
    Answer the following question based ONLY on the provided context snippets.
    For each sentence in your answer, you MUST cite the snippet it comes from using the format [1], [2], etc.
    If the context does not contain the answer, you must state: "I could not find an answer in the provided documents."
    Context Snippets:
    {context_for_llm}
    Question: "{query}"
    Answer:
    """
    
    response = llm.generate_content(prompt)
    print("LLM generated the final answer.")

    final_response = {
        "answer": response.text,
        "sources": sources_for_response
    }
    return final_response

