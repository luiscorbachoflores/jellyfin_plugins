using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using MediaBrowser.Common.Configuration;

namespace Jellyfin.Plugin.WeeklyPick.Api;

/// <summary>Estado por usuario de la recomendación de la semana actual: si se le ha
/// mostrado, si ha pulsado "Ver ficha" y si la ha cerrado sin acceder. Solo guarda la
/// semana más reciente de cada usuario (no un historial completo); al cambiar de semana
/// el registro anterior de ese usuario se considera obsoleto y se trata como "sin ver".</summary>
public class SeenStore
{
    private readonly string _path;
    private readonly object _lock = new();

    public SeenStore(IApplicationPaths applicationPaths)
    {
        var dir = Path.Combine(applicationPaths.DataPath, "weeklypick");
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "seen.v2.json");
    }

    public class UserWeekState
    {
        public string Week { get; set; } = string.Empty;

        public bool Shown { get; set; }

        public DateTime? ShownAtUtc { get; set; }

        public bool Clicked { get; set; }

        public DateTime? ClickedAtUtc { get; set; }

        public bool Dismissed { get; set; }

        public DateTime? DismissedAtUtc { get; set; }
    }

    private Dictionary<string, UserWeekState> Load()
    {
        if (!File.Exists(_path))
        {
            return new Dictionary<string, UserWeekState>();
        }

        try
        {
            var json = File.ReadAllText(_path);
            return JsonSerializer.Deserialize<Dictionary<string, UserWeekState>>(json) ?? new Dictionary<string, UserWeekState>();
        }
        catch (JsonException)
        {
            // Formato antiguo o corrupto: no es dato real del usuario, solo cache de "quién
            // ha visto ya el aviso esta semana". Se descarta y se empieza de cero.
            return new Dictionary<string, UserWeekState>();
        }
    }

    private void Save(Dictionary<string, UserWeekState> data)
    {
        File.WriteAllText(_path, JsonSerializer.Serialize(data));
    }

    private static UserWeekState FreshFor(string weekKey)
    {
        return new UserWeekState { Week = weekKey };
    }

    public bool WasNotifiedThisWeek(string userId, string weekKey)
    {
        lock (_lock)
        {
            var data = Load();
            return data.TryGetValue(userId, out var state) && state.Week == weekKey && state.Shown;
        }
    }

    public void MarkShown(string userId, string weekKey)
    {
        lock (_lock)
        {
            var data = Load();
            if (!data.TryGetValue(userId, out var state) || state.Week != weekKey)
            {
                state = FreshFor(weekKey);
            }

            state.Shown = true;
            state.ShownAtUtc = DateTime.UtcNow;
            data[userId] = state;
            Save(data);
        }
    }

    public void MarkClicked(string userId, string weekKey)
    {
        lock (_lock)
        {
            var data = Load();
            if (!data.TryGetValue(userId, out var state) || state.Week != weekKey)
            {
                state = FreshFor(weekKey);
            }

            state.Clicked = true;
            state.ClickedAtUtc = DateTime.UtcNow;
            data[userId] = state;
            Save(data);
        }
    }

    public void MarkDismissed(string userId, string weekKey)
    {
        lock (_lock)
        {
            var data = Load();
            if (!data.TryGetValue(userId, out var state) || state.Week != weekKey)
            {
                state = FreshFor(weekKey);
            }

            state.Dismissed = true;
            state.DismissedAtUtc = DateTime.UtcNow;
            data[userId] = state;
            Save(data);
        }
    }

    /// <summary>Estado de cada usuario para esa semana concreta (null si nunca se le ha
    /// mostrado nada esta semana, aunque exista en Jellyfin).</summary>
    public IReadOnlyDictionary<string, UserWeekState> StatesForWeek(string weekKey)
    {
        lock (_lock)
        {
            var data = Load();
            var result = new Dictionary<string, UserWeekState>();
            foreach (var (userId, state) in data)
            {
                if (state.Week == weekKey)
                {
                    result[userId] = state;
                }
            }

            return result;
        }
    }

    public void Clear()
    {
        lock (_lock)
        {
            if (File.Exists(_path))
            {
                File.Delete(_path);
            }
        }
    }
}
