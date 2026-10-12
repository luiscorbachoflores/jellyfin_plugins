using System.Collections.Generic;
using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.WeeklyPick;

public class WeeklyEntry
{
    /// <summary>Identificador estable de la entrada (independiente de las fechas, para poder
    /// consultar sus estadísticas aunque luego se edite el rango). Generado por el cliente.</summary>
    public string Id { get; set; } = string.Empty;

    /// <summary>Primer día (incluido) en que se muestra, yyyy-MM-dd.</summary>
    public string DateStart { get; set; } = string.Empty;

    /// <summary>Último día (incluido) en que se muestra, yyyy-MM-dd.</summary>
    public string DateEnd { get; set; } = string.Empty;

    public string Text { get; set; } = string.Empty;

    public string ItemId { get; set; } = string.Empty;

    /// <summary>Título mostrado en el listado de entradas, guardado al elegirlo en el buscador
    /// (puramente informativo para el admin; la recomendación en sí solo usa ItemId).</summary>
    public string ItemTitle { get; set; } = string.Empty;

    /// <summary>Cuántas veces se le muestra a cada usuario durante el rango (como máximo una
    /// vez por día, repartidas a lo largo de los días disponibles).</summary>
    public int TimesToShow { get; set; } = 2;

    /// <summary>Ids de los usuarios a los que se les muestra. Vacía = todos los usuarios
    /// habilitados (comportamiento por defecto, compatible con entradas antiguas).</summary>
    public List<string> UserIds { get; set; } = new();

    /// <summary>Borrado lógico: no se enseña en el panel ni se le muestra a nadie, pero sigue
    /// en la configuración (se puede restaurar) y sus estadísticas no se pierden.</summary>
    public bool Deleted { get; set; }
}

public class PluginConfiguration : BasePluginConfiguration
{
    public bool Enabled { get; set; } = true;

    public List<WeeklyEntry> Entries { get; set; } = new();
}
