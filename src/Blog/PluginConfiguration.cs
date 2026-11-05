using System.Collections.Generic;
using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.Blog;

public class PluginConfiguration : BasePluginConfiguration
{
    public string Title { get; set; } = Api.BlogDefaults.Title;

    public string Description { get; set; } = Api.BlogDefaults.Description;

    /// <summary>Añade la entrada «Blog» a menuLinks de /web/config.json.</summary>
    public bool ShowInMenu { get; set; } = true;

    /// <summary>Ids de usuarios con acceso al blog (lectura y escritura). Vacía = todos los
    /// usuarios con sesión (comportamiento por defecto, compatible con instalaciones previas).
    /// Los administradores siempre tienen acceso, estén o no en la lista.</summary>
    public List<string> AllowedUserIds { get; set; } = new();
}
