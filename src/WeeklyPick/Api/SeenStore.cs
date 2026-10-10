using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.WeeklyPick.Api;

/// <summary>Un fichero JSON {userId: "semana_ya_avisada"}. Compartido por el endpoint web
/// y por el aviso nativo de sesion, para no avisar dos veces a la misma persona la misma semana.
/// Lecturas y escrituras serializadas con un lock, escritura atomica (fichero temporal + move) y
/// lectura tolerante: un fichero corrupto se trata como vacio en vez de dar error 500 para siempre.</summary>
public class SeenStore
{
    private readonly string _path;
    private readonly ILogger<SeenStore> _logger;
    private readonly object _lock = new();
    private Dictionary<string, string>? _cache;

    public SeenStore(IApplicationPaths applicationPaths, ILogger<SeenStore> logger)
    {
        _logger = logger;
        var dir = Path.Combine(applicationPaths.DataPath, "weeklypick");
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "seen.json");
    }

    private Dictionary<string, string> Load()
    {
        if (_cache is not null)
        {
            return _cache;
        }

        var data = new Dictionary<string, string>();
        if (File.Exists(_path))
        {
            try
            {
                data = JsonSerializer.Deserialize<Dictionary<string, string>>(File.ReadAllText(_path)) ?? data;
            }
            catch (Exception ex) when (ex is JsonException or IOException)
            {
                _logger.LogWarning(ex, "WeeklyPick: seen.json no se pudo leer; se empieza de cero.");
            }
        }

        _cache = data;
        return data;
    }

    private void Save(Dictionary<string, string> data)
    {
        var tmp = _path + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(data));
        File.Move(tmp, _path, true);
    }

    public bool WasNotifiedThisWeek(string userId, string weekKey)
    {
        lock (_lock)
        {
            return Load().TryGetValue(userId, out var seenWeek) && seenWeek == weekKey;
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
            _cache = new Dictionary<string, string>();
            if (File.Exists(_path))
            {
                File.Delete(_path);
            }
        }
    }
}
