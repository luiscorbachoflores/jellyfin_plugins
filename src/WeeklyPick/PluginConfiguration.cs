using System.Collections.Generic;
using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.WeeklyPick;

public class WeeklyEntry
{
    /// <summary>El viernes (yyyy-MM-dd) que abre la semana de esta entrada.</summary>
    public string WeekStart { get; set; } = string.Empty;

    public string Text { get; set; } = string.Empty;

    public string ItemId { get; set; } = string.Empty;

    /// <summary>Título mostrado en el listado de entradas, guardado al elegirlo en el buscador
    /// (puramente informativo para el admin; la recomendación en sí solo usa ItemId).</summary>
    public string ItemTitle { get; set; } = string.Empty;
}

public class PluginConfiguration : BasePluginConfiguration
{
    public bool Enabled { get; set; } = true;

    public List<WeeklyEntry> Entries { get; set; } = new();
}
