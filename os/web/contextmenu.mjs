/**
 *
 * Displays a context menu at the specified target element.
 * @template T
 * @param {HTMLElement} targetElement
 * @param {{label: string, id: T, hidden?: boolean}[]} items
 * @param {(item: T) => void} onItemClick
 */
export function showContextMenu(targetElement, items, onItemClick) {
    if (document.getElementById("contextMenu") !== null) {
        // TODO: Already exists
        return;
    }
    const menu = document.createElement("div");
    menu.id = "contextMenu";
    menu.className = "context-menu context-menu-hidden";
    document.body.appendChild(menu);
    for (const item of items) {
        if (item.hidden) {
            continue;
        }
        const menuItem = document.createElement("div");
        menuItem.className = "context-menu-item";
        menuItem.textContent = item.label;
        menuItem.addEventListener("click", (e) => {
            e.preventDefault();
            onItemClick(item.id);
            menu.remove();
        });
        menu.appendChild(menuItem);
    }
    menu.classList.remove("context-menu-hidden");

    {
        const mW = menu.offsetWidth;
        const mH = menu.offsetHeight;

        const rect = targetElement.getBoundingClientRect();
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;
        const padding = 8; // gap from screen edges

        // Default: place below button
        let x = rect.left + scrollX;
        let y = rect.bottom + scrollY;

        // If overflows right edge, shift left
        if (x + mW > scrollX + window.innerWidth - padding) {
            x = Math.max(scrollX + padding, rect.right + scrollX - mW);
        }

        // If overflows bottom, place above
        if (y + mH > scrollY + window.innerHeight - padding) {
            y = rect.top + scrollY - mH;
        }

        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
    }

    const onClick = (/** @type {MouseEvent} */ e) => {
        document.removeEventListener("click", onClick);
        menu.remove();
    };

    setTimeout(() => {
        document.addEventListener("click", onClick, { once: true });
    }, 0);
}
