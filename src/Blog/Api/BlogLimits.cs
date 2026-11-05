namespace Jellyfin.Plugin.Blog.Api;

public static class BlogLimits
{
    public const int PageSize = 10;

    // Tope de página: (page - 1) * PageSize va directo al OFFSET y no debe desbordar int.
    public const int MaxPage = 10000;
    public const int TitleMax = 150;
    public const int PostBodyMax = 20000;
    public const int CommentBodyMax = 4000;
    public const int MaxLabels = 5;
    public const int LabelMax = 30;
    public const int MaxMentions = 10;
    public const int ExcerptLength = 1500;
    public const int RecentCommentExcerptLength = 120;
    public const int RecentCommentCount = 5;
    public const int SearchTextMax = 100;
}
