namespace Jellyfin.Plugin.Blog.Api;

/// <summary>Valores por defecto de la configuración y textos fijos. Sin tipos de Jellyfin.</summary>
public static class BlogDefaults
{
    public const string Title = "Blog de cine";

    public const string Description = "Lo que vemos, lo que nos gusta y lo que no.";

    public const string DeletedUserName = "Usuario eliminado";

    public static string TitleOrDefault(string? value) => string.IsNullOrWhiteSpace(value) ? Title : value.Trim();

    public static string DescriptionOrDefault(string? value) => value is null ? Description : value.Trim();
}
