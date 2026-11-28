using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.Diary;

public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>Horas durante las que dos registros de la misma película y usuario cuentan como un solo
    /// visionado (p. ej. verla y luego pulsar «visto»).</summary>
    public int DedupeHours { get; set; } = 12;
}
