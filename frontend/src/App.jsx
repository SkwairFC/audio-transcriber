import React, { useState, useRef } from 'react';
import { Mic, Square, Upload, FileAudio, ArrowRight, Loader2 } from 'lucide-react';
// Supprimez la ligne d'import de Alert et ajoutez directement les messages d'erreur dans des divs

const API_URL = 'https://audio-transcriber-y980.onrender.com';

const AudioTranscriber = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioFile, setAudioFile] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState({ transcript: '', summary: '' });
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);

  // Démarrer l'enregistrement
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (event) => {
        audioChunks.current.push(event.data);
      };

      mediaRecorder.current.onstop = () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/wav' });
        setAudioFile(audioBlob);
      };

      mediaRecorder.current.start();
      setIsRecording(true);
      setError('');
    } catch (err) {
      setError("Impossible d'accéder au microphone. Veuillez autoriser l'accès.");
    }
  };

  // Arrêter l'enregistrement
  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      setIsRecording(false);
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  // Gérer l'upload du fichier
  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('audio/')) {
      setAudioFile(file);
      setError('');
    } else {
      setError('Veuillez sélectionner un fichier audio valide');
    }
  };

  // Envoyer l'audio pour transcription
  const handleSubmit = async () => {
    if (!audioFile) return;

    try {
      setStatus('uploading');
      const formData = new FormData();
      formData.append('audio', audioFile);

const response = await fetch(`${API_URL}/api/transcribe`, {
  method: 'POST',
  body: formData,
  headers: {
    'Accept': 'application/json',
  },
});

      if (!response.ok) throw new Error('Erreur lors de la transcription');

      const data = await response.json();
      setResult(data);
      setStatus('success');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* En-tête */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold mb-2">Transcription Audio</h1>
        <p className="text-gray-600 text-sm">Enregistrez ou choisissez un fichier audio</p>
      </div>

      {/* Section Enregistrement */}
      <div className="mb-8">
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`w-20 h-20 rounded-full flex items-center justify-center transition-colors
              ${isRecording 
                ? 'bg-red-500 hover:bg-red-600' 
                : 'bg-blue-500 hover:bg-blue-600'}`}
          >
            {isRecording ? (
              <Square className="w-8 h-8 text-white" />
            ) : (
              <Mic className="w-8 h-8 text-white" />
            )}
          </button>
          <span className="text-sm text-gray-600">
            {isRecording ? 'Appuyez pour arrêter' : 'Appuyez pour enregistrer'}
          </span>
        </div>
      </div>

      {/* Section Upload */}
      <div className="mb-8">
        <div className="relative">
          <input
            type="file"
            accept="audio/*"
            onChange={handleFileSelect}
            className="hidden"
            id="audio-upload"
          />
          <label
            htmlFor="audio-upload"
            className="block w-full p-4 text-center border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500"
          >
            <FileAudio className="w-8 h-8 mx-auto mb-2 text-gray-400" />
            <span className="text-sm text-gray-600">
              Ou choisissez un fichier audio
            </span>
          </label>
        </div>
      </div>

      {/* Affichage du fichier sélectionné */}
      {audioFile && (
        <div className="mb-4 p-3 bg-white rounded-lg shadow-sm">
          <p className="text-sm text-gray-600 truncate">
            Fichier: {audioFile.name || 'Enregistrement audio'}
          </p>
        </div>
      )}

      {/* Messages d'erreur */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Bouton de soumission */}
      <button
        onClick={handleSubmit}
        disabled={!audioFile || status === 'uploading'}
        className={`w-full p-4 rounded-lg flex items-center justify-center gap-2 
          ${!audioFile || status === 'uploading'
            ? 'bg-gray-200 text-gray-500'
            : 'bg-blue-500 text-white hover:bg-blue-600'}`}
      >
        {status === 'uploading' ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <>
            <Upload className="w-5 h-5" />
            <span>Transcrire</span>
          </>
        )}
      </button>

      {/* Résultats */}
      {status === 'success' && (
        <div className="mt-8 space-y-4">
          <div className="bg-white p-4 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-2">Transcription</h2>
            <p className="text-gray-700">{result.transcript}</p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-2">Résumé</h2>
            <p className="text-gray-700">{result.summary}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AudioTranscriber;