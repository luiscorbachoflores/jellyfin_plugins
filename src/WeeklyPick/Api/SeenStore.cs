using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using MediaBrowser.Common.Configuration;

namespace Jellyfin.Plugin.WeeklyPick.Api;

/// <summary>Historial por usuario y por entrada (no por semana: cada entrada cubre el rango
/// de días que el admin le haya puesto) de cuántas veces se le ha mostrado, si ha pulsado
/// "Ver ficha", si la ha cerrado sin acceder, y si ha dicho que le interesa o no. Guarda TODAS
/// las entradas, para poder revisar quién vio una recomendación antigua. Clave interna:
/// "userId|entryId".</summary>
public class SeenStore
{
    private readonly string _path;
    private readonly object _lock = new();

    public SeenStore(IApplicationPaths applicationPaths)
    {
        var dir = Path.Combine(applicationPaths.DataPath, "weeklypick");
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "seen.v5.json");
    }

    public class UserEntryState
    {
        public string EntryId { get; set; } = string.Empty;

        public int ShowCount { get; set; }

        public DateTime? FirstShownAtUtc { get; set; }

        public DateTime? LastShownAtUtc { get; set; }

        /// <summary>Fecha (yyyy-MM-dd, hora local del servidor) del último aviso, para no
        /// mostrarlo más de una vez el mismo día.</summary>
        public string LastShownDate { get; set; } = string.Empty;

        public bool Clicked { get; set; }

        public DateTime? ClickedAtUtc { get; set; }

        public bool Dismissed { get; set; }

        public DateTime? DismissedAtUtc { get; set; }

        /// <summary>null = sin opinión, true = "me interesa", false = "no me interesa".</summary>
        public bool? Interested { get; set; }

        public DateTime? InterestAtUtc { get; set; }
    }

    private static string Key(string userId, string entryId) => userId + "|" + entryId;

    private Dictionary<string, UserEntryState> Load()
    {
        if (!File.Exists(_path))
        {
            return new Dictionary<string, UserEntryState>();
        }

        try
        {
            var json = File.ReadAllText(_path);
            return JsonSerializer.Deserialize<Dictionary<string, UserEntryState>>(json) ?? new Dictionary<string, UserEntryState>();
        }
        catch (JsonException)
        {
            // Formato antiguo o corrupto: no es dato real del usuario, solo cache de "quién
            // ha visto el aviso". Se descarta y se empieza de cero.
            return new Dictionary<string, UserEntryState>();
        }
    }

    private void Save(Dictionary<string, UserEntryState> data)
    {
        File.WriteAllText(_path, JsonSerializer.Serialize(data));
    }

    /// <summary>Si todavía le queda alguna vez por mostrarse hoy a este usuario para esta
    /// entrada: no se le ha mostrado ya hoy, y no ha alcanzado el máximo de veces.</summary>
    public bool ShouldShowToday(string userId, string entryId, int timesToShow, string todayDate)
    {
        lock (_lock)
        {
            var data = Load();
            if (!data.TryGetValue(Key(userId, entryId), out var state))
            {
                return timesToShow > 0;
            }

            if (state.LastShownDate == todayDate)
            {
                return false;
            }

            return state.ShowCount < timesToShow;
        }
    }

    private UserEntryState GetOrCreate(Dictionary<string, UserEntryState> data, string key, string entryId)
    {
        if (!data.TryGetValue(key, out var state))
        {
            state = new UserEntryState { EntryId = entryId };
        }

        return state;
    }

    public void MarkShown(string userId, string entryId, string todayDate)
    {
        lock (_lock)
        {
            var data = Load();
            var key = Key(userId, entryId);
            var state = GetOrCreate(data, key, entryId);
            state.ShowCount += 1;
            state.LastShownDate = todayDate;
            state.LastShownAtUtc = DateTime.UtcNow;
            state.FirstShownAtUtc ??= DateTime.UtcNow;
            data[key] = state;
            Save(data);
        }
    }

    public void MarkClicked(string userId, string entryId)
    {
        lock (_lock)
        {
            var data = Load();
            var key = Key(userId, entryId);
            var state = GetOrCreate(data, key, entryId);
            state.Clicked = true;
            state.ClickedAtUtc = DateTime.UtcNow;
            data[key] = state;
            Save(data);
        }
    }

    public void MarkDismissed(string userId, string entryId)
    {
        lock (_lock)
        {
            var data = Load();
            var key = Key(userId, entryId);
            var state = GetOrCreate(data, key, entryId);
            state.Dismissed = true;
            state.DismissedAtUtc = DateTime.UtcNow;
            data[key] = state;
            Save(data);
        }
    }

    public void MarkInterest(string userId, string entryId, bool interested)
    {
        lock (_lock)
        {
            var data = Load();
            var key = Key(userId, entryId);
            var state = GetOrCreate(data, key, entryId);
            state.Interested = interested;
            state.InterestAtUtc = DateTime.UtcNow;
            data[key] = state;
            Save(data);
        }
    }

    /// <summary>Estado de cada usuario para una entrada concreta (los que no aparecen nunca
    /// se les mostró nada de esa entrada, aunque existan en Jellyfin). Sirve tanto para la
    /// entrada activa hoy como para revisar una antigua.</summary>
    public IReadOnlyDictionary<string, UserEntryState> StatesForEntry(string entryId)
    {
        lock (_lock)
        {
            var data = Load();
            var result = new Dictionary<string, UserEntryState>();
            foreach (var (key, state) in data)
            {
                if (state.EntryId == entryId)
                {
                    var userId = key.Substring(0, key.Length - entryId.Length - 1);
                    result[userId] = state;
                }
            }

            return result;
        }
    }

    /// <summary>Olvida lo registrado de UN usuario para esta entrada (para que vuelva a
    /// aparecerle a él solo), sin tocar a los demás ni otras entradas.</summary>
    public void ClearUser(string userId, string entryId)
    {
        lock (_lock)
        {
            var data = Load();
            data.Remove(Key(userId, entryId));
            Save(data);
        }
    }
}
