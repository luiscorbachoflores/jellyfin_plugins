using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using MediaBrowser.Common.Configuration;

namespace Jellyfin.Plugin.WeeklyPick.Api;

/// <summary>Un fichero JSON {userId: "semana_ya_avisada"}. Compartido por el endpoint web
/// y por el aviso nativo de sesion, para no avisar dos veces a la misma persona la misma semana.</summary>
public class SeenStore
{
    private readonly string _path;
    private readonly object _lock = new();

    public SeenStore(IApplicationPaths applicationPaths)
    {
        var dir = Path.Combine(applicationPaths.DataPath, "weeklypick");
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "seen.json");
    }

    private Dictionary<string, string> Load()
    {
        if (!File.Exists(_path))
        {
            return new Dictionary<string, string>();
        }

        var json = File.ReadAllText(_path);
        return JsonSerializer.Deserialize<Dictionary<string, string>>(json) ?? new Dictionary<string, string>();
    }

    private void Save(Dictionary<string, string> data)
    {
        File.WriteAllText(_path, JsonSerializer.Serialize(data));
    }

    public bool WasNotifiedThisWeek(string userId, string weekKey)
    {
        lock (_lock)
        {
            var data = Load();
            return data.TryGetValue(userId, out var seenWeek) && seenWeek == weekKey;
        }
    }

    public void MarkNotified(string userId, string weekKey)
    {
        lock (_lock)
        {
            var data = Load();
            data[userId] = weekKey;
            Save(data);
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
