'use client';

import React, { useState, useEffect } from 'react';

export default function Home() {
  const [courses, setCourses] = useState<any[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [courseName, setCourseName] = useState('');
  const [hoursPerDay, setHoursPerDay] = useState('');

  const API_BASE = '/api';

  // Charger les cours
  const loadCourses = async () => {
    try {
      const response = await fetch(`${API_BASE}/courses`);
      if (response.ok) {
        const data = await response.json();
        setCourses(data);
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  // Ajouter un cours
  const addCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseName || !hoursPerDay) return;

    try {
      const response = await fetch(`${API_BASE}/courses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify({
          name: courseName,
          hoursPerDay: parseFloat(hoursPerDay),
          startDate: new Date().toISOString()
        })
      });

      if (response.ok) {
        setCourseName('');
        setHoursPerDay('');
        loadCourses();
        alert('Cours ajouté avec succès !');
      } else {
        alert('Erreur lors de l\'ajout');
      }
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur de connexion');
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            🧠 Planning Médical Intelligent
          </h1>
          <p className="text-gray-600">
            Système d'espacement J pour optimiser la rétention mémorielle
          </p>
        </div>

        {/* Configuration */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">⚙️ Configuration</h2>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Clé API (optionnel pour la lecture)
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Votre clé API"
              className="w-full p-3 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        {/* Ajouter un cours */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">➕ Ajouter un cours</h2>
          <form onSubmit={addCourse} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nom du cours
              </label>
              <input
                type="text"
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                placeholder="Ex: Anatomie, Physiologie..."
                className="w-full p-3 border border-gray-300 rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Heures par jour
              </label>
              <input
                type="number"
                step="0.5"
                value={hoursPerDay}
                onChange={(e) => setHoursPerDay(e.target.value)}
                placeholder="Ex: 2, 1.5, 3..."
                className="w-full p-3 border border-gray-300 rounded-lg"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 font-medium"
            >
              Ajouter le cours
            </button>
          </form>
        </div>

        {/* Liste des cours */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">📚 Mes cours ({courses.length})</h2>

          {courses.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>Aucun cours ajouté pour l'instant.</p>
              <p className="text-sm">Ajoutez votre premier cours ci-dessus !</p>
            </div>
          ) : (
            <div className="space-y-4">
              {courses.map((course, index) => (
                <div key={course._id || index} className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-lg">{course.name}</h3>
                  <p className="text-gray-600">
                    {course.hoursPerDay} heures par jour
                  </p>
                  <p className="text-sm text-gray-500">
                    {course.sessions?.length || 0} sessions programmées
                  </p>
                  {course.description && (
                    <p className="text-sm text-gray-500 mt-2">{course.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    Créé le: {new Date(course.createdAt || course.startDate).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-medium text-blue-900 mb-2">🚀 Instructions :</h3>
          <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
            <li>Ajoutez vos cours avec le nombre d'heures d'étude par jour</li>
            <li>Le système créera automatiquement un planning avec espacement J (J+1, J+3, J+7, J+15, J+30, J+90)</li>
            <li>Configurez votre clé API pour accéder aux fonctionnalités avancées</li>
            <li>Les données sont sauvegardées dans la base de données MongoDB</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
